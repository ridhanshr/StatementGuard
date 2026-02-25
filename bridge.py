"""
Bridge script for Electron <-> Python communication.
Reads JSON commands from stdin, runs validation, outputs JSON results to stdout.
Progress updates are sent as PROGRESS:{json} lines.
Incremental data updates are sent as DATA:{json} lines for realtime table display.
"""

import sys
import os
import json
import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.core.validation import PTSTMTValidator, ValidationResult
from src.utils.data_utils import to_date, slice_num, slice_str, extract_posting_date, extract_card_number, custom_round
import re


def send_progress(processed, total):
    """Send progress update to Electron."""
    percent = int((processed / total) * 100) if total > 0 else 0
    progress_data = {"processed": processed, "total": total, "percent": percent}
    sys.stdout.write(f"PROGRESS:{json.dumps(progress_data)}\n")
    sys.stdout.flush()


def send_data(module, rows):
    """Send incremental data to Electron for realtime display."""
    data_msg = {"module": module, "rows": rows}
    sys.stdout.write(f"DATA:{json.dumps(data_msg, default=str)}\n")
    sys.stdout.flush()


def process_validation_realtime(params):
    """Run validation with realtime streaming of results."""
    file_path = params["file_path"]
    card_type = params.get("card_type", "REGULAR")
    from_date_str = params.get("from_date", "2025-10-16")
    until_date_str = params.get("until_date", "2025-11-15")

    from_date = datetime.datetime.strptime(from_date_str, "%Y-%m-%d").date()
    until_date = datetime.datetime.strptime(until_date_str, "%Y-%m-%d").date()

    # Determine target header type based on card type
    target_header_type = "02"  # default for REGULAR
    if card_type == "CORPORATE":
        target_header_type = "02"

    # Count total lines
    with open(file_path, "r", encoding="latin-1") as f:
        total_lines = sum(1 for _ in f)

    # Data collectors
    filtered = []
    validations = []
    card_records = {}
    transaction_tracker = {}
    card_transactions = {}
    card_tot_payment = {}
    zero_amount_transactions = []
    customer_sequences = {}

    # State
    current_header = None
    current_stats = {"DR": 0, "CR": 0}
    current_customer = None
    current_card = None
    processed = 0

    # Batch buffer for streaming
    val_batch = []
    filter_batch = []
    zero_batch = []
    BATCH_SIZE = 5  # Send every N items

    def flush_batches():
        nonlocal val_batch, filter_batch, zero_batch
        if val_batch:
            send_data("validations", val_batch)
            val_batch = []
        if filter_batch:
            send_data("filtered_transactions", filter_batch)
            filter_batch = []
        if zero_batch:
            send_data("zero_amount_transactions", zero_batch)
            zero_batch = []

    def validate_block(header, stats, card_type_val):
        """Validate a block and stream results immediately."""
        card = header['card']
        expected_new = stats["DR"] + header['prev'] + header['int'] - stats["CR"]
        expected_new = custom_round(expected_new)
        expected_avl = header['cr_limit'] - expected_new - header['instl']
        expected_avl = custom_round(expected_avl)

        if card_type_val == "CORPORATE":
            expected_min_pay = expected_new
        else:
            expected_min_pay = custom_round(expected_new * 0.05)
            if expected_min_pay < 50000:
                expected_min_pay = 50000

        if expected_new <= 0:
            expected_min_pay = 0

        def check(field, exp, act):
            return {
                "card": card, "field": field, "expected": exp,
                "actual": act, "status": "PASS" if exp == act else "FAIL"
            }

        results = [
            check("NEW_BAL", expected_new, header['new_bal']),
            check("AVL_CR_LIMIT", expected_avl, header['avl_actual']),
            check("PT_SH_MIN_PAYMENT", expected_min_pay, header['amount_due'])
        ]
        validations.extend(results)
        val_batch.extend(results)

    # Process file
    with open(file_path, "r", encoding="latin-1") as f:
        for line in f:
            processed += 1

            if processed % 1000 == 0:
                send_progress(processed, total_lines)
                flush_batches()

            record_type = line[:2]

            # Track structure
            if record_type == "01":
                current_customer = slice_str(line, 3, 18)
                if current_customer not in card_records:
                    card_records[current_customer] = set()
                    customer_sequences[current_customer] = []
                card_records[current_customer].add("01")
                customer_sequences[current_customer].append("01")

            if record_type == target_header_type:
                if current_header is not None:
                    validate_block(current_header, current_stats, card_type)

                current_stats = {"DR": 0, "CR": 0}
                current_card = slice_str(line, 28, 43)
                current_header = {
                    'card': current_card,
                    'prev': slice_num(line, 324, 338),
                    'int': slice_num(line, 399, 413),
                    'cr_limit': slice_num(line, 279, 292),
                    'instl': slice_num(line, 891, 900),
                    'new_bal': slice_num(line, 414, 428),
                    'amount_due': slice_num(line, 264, 277),
                    'avl_actual': slice_num(line, 294, 308)
                }

                tot_payment = slice_num(line, 354, 367)
                card_tot_payment[current_card] = tot_payment
                card_transactions[current_card] = []

                if record_type == "02" and current_customer:
                    card_records[current_customer].add("02")
                    customer_sequences[current_customer].append("02")

            elif record_type == "03":
                posting_date = to_date(extract_posting_date(line))
                card_num = extract_card_number(line)
                trx_detail = slice_str(line, 90, 129)
                trx_amt = slice_num(line, 149, 162)
                trx_dir = slice_str(line, 163, 164)

                if posting_date < from_date or posting_date > until_date:
                    entry = {
                        "posting": str(posting_date),
                        "card": card_num,
                        "line": line.rstrip()
                    }
                    filtered.append(entry)
                    filter_batch.append(entry)

                # Track duplicate
                dup_key = (card_num, str(posting_date), trx_detail, trx_amt, trx_dir)
                transaction_tracker[dup_key] = transaction_tracker.get(dup_key, 0) + 1

                # Track CR for tot_payment
                if current_card and current_card in card_transactions:
                    card_transactions[current_card].append({
                        'direction': trx_dir,
                        'amount': trx_amt
                    })

                # Track zero amount
                if trx_amt == 0:
                    entry = {
                        "card": card_num,
                        "posting_date": str(posting_date),
                        "trx_detail": trx_detail,
                        "amount": trx_amt,
                        "direction": trx_dir
                    }
                    zero_amount_transactions.append(entry)
                    zero_batch.append(entry)

                if current_header is not None:
                    current_stats[trx_dir] = current_stats.get(trx_dir, 0) + trx_amt

                if current_customer:
                    card_records[current_customer].add("03")
                    customer_sequences[current_customer].append("03")

            elif record_type == "04":
                if current_customer:
                    card_records[current_customer].add("04")
                    customer_sequences[current_customer].append("04")

            # Flush batches periodically
            if len(val_batch) >= BATCH_SIZE or len(filter_batch) >= BATCH_SIZE or len(zero_batch) >= BATCH_SIZE:
                flush_batches()

    # Validate last block
    if current_header is not None:
        validate_block(current_header, current_stats, card_type)
        flush_batches()

    send_progress(total_lines, total_lines)

    # Generate post-processing results and stream them
    # Structure results
    required = {"01", "02", "03", "04"}
    structure_results = []
    for customer, types in card_records.items():
        missing = required - types
        structure_results.append({
            "customer": customer,
            "has_01": "Yes" if "01" in types else "No",
            "has_02": "Yes" if "02" in types else "No",
            "has_03": "Yes" if "03" in types else "No",
            "has_04": "Yes" if "04" in types else "No",
            "status": "VALID" if not missing else "INVALID",
            "missing": ", ".join(sorted(missing)) if missing else "-"
        })
    send_data("structure_results", structure_results)

    # Duplicate results
    duplicate_transactions = []
    for key, count in transaction_tracker.items():
        if count > 1:
            card_num, posting_date, trx_detail, trx_amt, trx_dir = key
            duplicate_transactions.append({
                "card": card_num,
                "posting_date": posting_date,
                "trx_detail": trx_detail,
                "amount": trx_amt,
                "direction": trx_dir,
                "count": count
            })
    send_data("duplicate_transactions", duplicate_transactions)

    # Tot payment results
    tot_payment_results = []
    for card, tot_payment in card_tot_payment.items():
        transactions = card_transactions.get(card, [])
        cr_transactions = [t for t in transactions if t['direction'] == 'CR']
        has_cr = len(cr_transactions) > 0
        cr_total = sum(t['amount'] for t in cr_transactions)
        if has_cr and tot_payment == 0:
            status = "INVALID"
        else:
            status = "VALID"
        tot_payment_results.append({
            "card": card,
            "tot_payment": tot_payment,
            "has_cr": "Yes" if has_cr else "No",
            "cr_total": cr_total,
            "status": status
        })
    send_data("tot_payment_results", tot_payment_results)

    # Sequence results
    pattern = re.compile(r"^01(02(03)*04)((02|03)(03)*04)*$")
    sequence_results = []
    for customer, seq in customer_sequences.items():
        seq_str = "".join(seq)
        status = "VALID" if pattern.match(seq_str) else "INVALID"
        sequence_results.append({
            "customer": customer,
            "sequence": "->".join(seq),
            "status": status
        })
    send_data("sequence_results", sequence_results)

    # Return final combined result
    return {
        "success": True,
        "data": {
            "validations": validations,
            "filtered_transactions": filtered,
            "structure_results": structure_results,
            "duplicate_transactions": duplicate_transactions,
            "zero_amount_transactions": zero_amount_transactions,
            "tot_payment_results": tot_payment_results,
            "sequence_results": sequence_results
        }
    }


def main():
    try:
        input_data = sys.stdin.read()
        params = json.loads(input_data.strip())

        result = process_validation_realtime(params)

        # Final JSON output
        print(json.dumps(result, default=str))
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()

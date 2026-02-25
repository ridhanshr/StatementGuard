"""
Core Validation Logic for StatementGuard
Contains the main validation logic for PTSTMT files.
"""

import datetime
import re
from dataclasses import dataclass
from typing import List, Dict, Tuple, Callable

from src.utils.data_utils import (
    extract_posting_date, 
    extract_card_number, 
    to_date, 
    slice_num, 
    slice_str, 
    custom_round
)


@dataclass
class ValidationResult:
    """Data class to hold validation results."""
    filtered_transactions: List[Dict]
    validations: List[Dict]
    structure_results: List[Dict]
    duplicate_transactions: List[Dict]
    zero_amount_transactions: List[Dict]
    tot_payment_results: List[Dict]
    sequence_results: List[Dict]


class PTSTMTValidator:
    """Main validator class for PTSTMT files."""
    
    def __init__(self, file_path: str, card_type: str, from_date: datetime.date, until_date: datetime.date):
        """Initialize validator.
        
        Args:
            file_path: Path to PTSTMT file
            card_type: Type of card ('REGULAR' or 'CORPORATE')
            from_date: Start date for filtering
            until_date: End date for filtering
        """
        self.file_path = file_path
        self.card_type = card_type
        self.from_date = from_date
        self.until_date = until_date
        self.target_header_type = "02" if card_type == "REGULAR" else "01"
    
    def process_file(self, progress_callback: Callable[[int, int], None] = None) -> ValidationResult:
        """Process the PTSTMT file and return validation results.
        
        Args:
            progress_callback: Optional callback for progress updates
            
        Returns:
            ValidationResult: Object containing all validation results
        """
        # Count total lines
        with open(self.file_path, "r", encoding="latin-1") as f:
            total_lines = sum(1 for _ in f)
        
        # Data collectors
        filtered = []
        validations = []
        card_records = {}  # customer -> set of record types
        transaction_tracker = {}  # For duplicate detection: key -> count
        card_transactions = {}  # card -> list of transactions for CR check
        card_tot_payment = {}  # card -> tot_payment from prefix 02
        zero_amount_transactions = []  # Transactions with amount = 0
        customer_sequences = {}  # customer -> list of record types
        
        # State
        current_header = None
        current_stats = {"DR": 0, "CR": 0}
        current_customer = None
        current_card = None
        processed = 0
        
        # Process file
        with open(self.file_path, "r", encoding="latin-1") as f:
            for line in f:
                processed += 1
                
                if progress_callback and processed % 1000 == 0:
                    progress_callback(processed, total_lines)
                
                record_type = line[:2]
                
                # Track structure validation
                if record_type == "01":
                    current_customer = slice_str(line, 3, 18)
                    if current_customer not in card_records:
                        card_records[current_customer] = set()
                        customer_sequences[current_customer] = []
                    card_records[current_customer].add("01")
                    customer_sequences[current_customer].append("01")
                
                if record_type == self.target_header_type:
                    if current_header is not None:
                        self._validate_block(current_header, current_stats, validations, self.card_type)
                    
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
                    
                    if posting_date < self.from_date or posting_date > self.until_date:
                        filtered.append({
                            "posting": posting_date,
                            "card": card_num,
                            "line": line.rstrip()
                        })
                    
                    # Track for duplicate detection
                    dup_key = (card_num, posting_date, trx_detail, trx_amt, trx_dir)
                    transaction_tracker[dup_key] = transaction_tracker.get(dup_key, 0) + 1
                    
                    # Track CR transactions for tot_payment validation
                    if current_card and current_card in card_transactions:
                        card_transactions[current_card].append({
                            'direction': trx_dir,
                            'amount': trx_amt
                        })
                    
                    # Track zero amount transactions
                    if trx_amt == 0:
                        zero_amount_transactions.append({
                            "card": card_num,
                            "posting_date": posting_date,
                            "trx_detail": trx_detail,
                            "amount": trx_amt,
                            "direction": trx_dir
                        })
                    
                    if current_header is not None:
                        current_stats[trx_dir] = current_stats.get(trx_dir, 0) + trx_amt
                    
                    if current_customer:
                        card_records[current_customer].add("03")
                        customer_sequences[current_customer].append("03")
                
                elif record_type == "04":
                    if current_customer:
                        card_records[current_customer].add("04")
                        customer_sequences[current_customer].append("04")
        
        # Validate last block
        if current_header is not None:
            self._validate_block(current_header, current_stats, validations, self.card_type)
        
        # Generate results
        structure_results = self._generate_structure_results(card_records)
        duplicate_results = self._generate_duplicate_results(transaction_tracker)
        totpay_results = self._generate_totpay_results(card_tot_payment, card_transactions)
        sequence_results = self._generate_sequence_results(customer_sequences)
        
        return ValidationResult(
            filtered_transactions=filtered,
            validations=validations,
            structure_results=structure_results,
            duplicate_transactions=duplicate_results,
            zero_amount_transactions=zero_amount_transactions,
            tot_payment_results=totpay_results,
            sequence_results=sequence_results
        )
    
    def _validate_block(self, header: Dict, stats: Dict, validations: List[Dict], card_type: str):
        """Validate a completed card block.
        
        Args:
            header: Header data dictionary
            stats: Transaction statistics
            validations: List to append validation results to
            card_type: Type of card
        """
        card = header['card']
        
        expected_new = stats["DR"] + header['prev'] + header['int'] - stats["CR"]
        expected_new = custom_round(expected_new)
        
        expected_avl = header['cr_limit'] - expected_new - header['instl']
        expected_avl = custom_round(expected_avl)
        
        if card_type == "CORPORATE":
            expected_min_pay = expected_new
        else:
            expected_min_pay = custom_round(expected_new * 0.05)
            if expected_min_pay < 50000:
                expected_min_pay = 50000
        
        if expected_new <= 0:
            expected_min_pay = 0
        
        def check(field: str, exp, act) -> Dict:
            return {
                "card": card, "field": field, "expected": exp,
                "actual": act, "status": "PASS" if exp == act else "FAIL"
            }
        
        validations.append(check("NEW_BAL", expected_new, header['new_bal']))
        validations.append(check("AVL_CR_LIMIT", expected_avl, header['avl_actual']))
        validations.append(check("PT_SH_MIN_PAYMENT", expected_min_pay, header['amount_due']))
    
    def _generate_structure_results(self, card_records: Dict[str, set]) -> List[Dict]:
        """Generate structure validation results.
        
        Args:
            card_records: Dictionary mapping customers to their record types
            
        Returns:
            List of structure validation result dictionaries
        """
        results = []
        required = {"01", "02", "03", "04"}
        
        for customer, types in card_records.items():
            missing = required - types
            results.append({
                "customer": customer,
                "has_01": "Yes" if "01" in types else "No",
                "has_02": "Yes" if "02" in types else "No",
                "has_03": "Yes" if "03" in types else "No",
                "has_04": "Yes" if "04" in types else "No",
                "status": "VALID" if not missing else "INVALID",
                "missing": ", ".join(sorted(missing)) if missing else "-"
            })
        
        return results
    
    def _generate_duplicate_results(self, transaction_tracker: Dict[Tuple, int]) -> List[Dict]:
        """Generate duplicate transaction results.
        
        Args:
            transaction_tracker: Dictionary tracking transaction counts
            
        Returns:
            List of duplicate transaction result dictionaries
        """
        results = []
        
        for key, count in transaction_tracker.items():
            if count > 1:  # Only include duplicates
                card, posting_date, trx_detail, amount, direction = key
                results.append({
                    "card": card,
                    "posting_date": posting_date,
                    "trx_detail": trx_detail,
                    "amount": amount,
                    "direction": direction,
                    "count": count
                })
        
        return results
    
    def _generate_totpay_results(self, card_tot_payment: Dict[str, int], 
                                card_transactions: Dict[str, List[Dict]]) -> List[Dict]:
        """Generate tot_payment validation results.
        
        Check if tot_payment is 0 but there are CR transactions.
        If CR exists but tot_payment is 0, this is INVALID.
        
        Args:
            card_tot_payment: Dictionary mapping cards to their tot_payment values
            card_transactions: Dictionary mapping cards to their transactions
            
        Returns:
            List of tot_payment validation result dictionaries
        """
        results = []
        
        for card, tot_payment in card_tot_payment.items():
            transactions = card_transactions.get(card, [])
            cr_transactions = [t for t in transactions if t['direction'] == 'CR']
            has_cr = len(cr_transactions) > 0
            cr_total = sum(t['amount'] for t in cr_transactions)
            
            # Determine status: if has CR but tot_payment is 0, it's INVALID
            if has_cr and tot_payment == 0:
                status = "INVALID"
            else:
                status = "VALID"
            
            results.append({
                "card": card,
                "tot_payment": tot_payment,
                "has_cr": "Yes" if has_cr else "No",
                "cr_total": cr_total,
                "status": status
            })
        
        return results
    
    def _generate_sequence_results(self, customer_sequences: Dict[str, List[str]]) -> List[Dict]:
        """Generate sequence validation results.
        
        Valid Pattern: ^01(02(03)*04)((02|03)(03)*04)*$
        This ensures:
        - Starts with 01
        - First block must be: 02 -> (03s) -> 04
        - Subsequent blocks can be: (02 or 03) -> (03s) -> 04
        
        Args:
            customer_sequences: Dictionary mapping customers to their record sequences
            
        Returns:
            List of sequence validation result dictionaries
        """
        results = []
        # Regex for valid structure:
        # ^01 : Starts with 01
        # (02(03)*04) : First block must be normal (02..04)
        # ( : Start of subsequent blocks group
        #   (02|03) : Block can start with 02 OR 03
        #   (03)* : Zero or more 03s
        #   04 : End of block
        # )* : Repeat subsequent blocks zero or more times
        # $ : End of string
        pattern = re.compile(r"^01(02(03)*04)((02|03)(03)*04)*$")
        
        for customer, seq in customer_sequences.items():
            # Join list into string "01020304..."
            seq_str = "".join(seq)
            
            status = "VALID"
            if not pattern.match(seq_str):
                status = "INVALID"
            
            results.append({
                "customer": customer,
                "sequence": "->".join(seq),
                "status": status
            })
        
        return results
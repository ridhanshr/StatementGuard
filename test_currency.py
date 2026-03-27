
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.utils.data_utils import slice_str, slice_num

def test_currency_parsing():
    # Mock record 03 line
    # Positions:
    # 1-2: Record Type (03)
    # 27-42: Card Number
    # 90-129: Trx Detail
    # 131-133: Currency Code
    # 149-162: Amount
    # 163-164: Direction
    
    # Construction with exact positions (1-based)
    line_list = [' '] * 1000
    
    # 1-2: Record Type
    line_list[0:2] = list("03")
    # 27-42: Card Number
    line_list[26:42] = list("1234567890123456")
    # 90-129: Trx Detail
    line_list[89:129] = list("TEST TRANSACTION".ljust(40))
    # 131-133: Currency Code
    line_list[130:133] = list("840")
    # 149-162: Amount
    line_list[148:162] = list("00000000100000")
    # 163-164: Direction
    line_list[162:164] = list("DR")
    
    line = "".join(line_list)
    
    # Using 1-based indexing like slice_str/slice_num
    trx_currency = slice_str(line, 131, 133)
    trx_amt = slice_num(line, 149, 162)
    trx_dir = slice_str(line, 163, 164)
    trx_detail = slice_str(line, 90, 129)
    
    print(f"Line type: {line[:2]}")
    print(f"Currency: '{trx_currency}'")
    print(f"Amount: {trx_amt}")
    print(f"Direction: '{trx_dir}'")
    print(f"Detail: '{trx_detail}'")
    
    assert trx_currency == "840", f"Expected 840, got {trx_currency}"
    assert trx_amt == 100000, f"Expected 100000, got {trx_amt}"
    assert trx_dir == "DR", f"Expected DR, got {trx_dir}"
    
    print("\nSUCCESS: Currency parsing logic verified!")

if __name__ == "__main__":
    test_currency_parsing()

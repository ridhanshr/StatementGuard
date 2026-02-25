"""
Data Utility Functions for StatementGuard
Contains utility functions for parsing and extracting data from PTSTMT files.
"""

import datetime


def extract_posting_date(line: str) -> str:
    """Extract posting date from a PTSTMT line.
    
    Args:
        line: A line from PTSTMT file
        
    Returns:
        str: Posting date in YYYYMMDD format
    """
    date_segment = line[75:89]
    posting_raw = date_segment[6:16]
    return posting_raw


def extract_card_number(line: str) -> str:
    """Extract card number from a PTSTMT line.
    
    Args:
        line: A line from PTSTMT file
        
    Returns:
        str: 16-digit card number
    """
    return line[27:43].strip()


def to_date(yyyymmdd: str) -> datetime.date:
    """Convert YYYYMMDD string to date object.
    
    Args:
        yyyymmdd: Date string in YYYYMMDD format
        
    Returns:
        datetime.date: Date object
    """
    return datetime.datetime.strptime(yyyymmdd, "%Y%m%d").date()


def slice_num(line: str, start: int, end: int) -> int:
    """Extract numeric value from line with 1-based indexing.
    
    Handles:
    - Empty fields (returns 0)
    - Negative numbers (ending with -)
    - Positive numbers
    
    Args:
        line: A line from PTSTMT file
        start: Start position (1-based index)
        end: End position (1-based index)
        
    Returns:
        int: Extracted numeric value
    """
    field = line[start-1:end].strip()
    
    if not field:
        return 0
    
    # Handle negative numbers (ending with -)
    if field.endswith("-"):
        num = field[:-1].strip()
        return -int(num) if num.isdigit() else 0
    
    # Handle positive numbers
    return int(field) if field.isdigit() else 0


def slice_str(line: str, start: int, end: int) -> str:
    """Extract string value from line with 1-based indexing.
    
    Args:
        line: A line from PTSTMT file
        start: Start position (1-based index)
        end: End position (1-based index)
        
    Returns:
        str: Extracted string value
    """
    return line[start-1:end].strip()


def custom_round(x) -> int:
    """Custom rounding function for financial calculations.
    
    Rounds to nearest integer:
    - x.5 and above rounds up
    - Below x.5 rounds down
    
    Args:
        x: Number to round (can be int, float, or string)
        
    Returns:
        int: Rounded value, or original value if not numeric
    """
    try:
        x = float(x)
    except (ValueError, TypeError):
        return x
    
    integer = int(x)
    decimal = x - integer
    return integer + 1 if decimal >= 0.5 else integer
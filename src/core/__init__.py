"""
Core package for StatementGuard.
Contains the main validation logic and business logic.
"""

from .validation import PTSTMTValidator, ValidationResult

__all__ = [
    'PTSTMTValidator',
    'ValidationResult'
]
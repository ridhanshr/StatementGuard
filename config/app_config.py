"""
Application Configuration for StatementGuard
Centralized configuration settings for the application.
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class AppConfig:
    """Application configuration settings."""
    
    # Application settings
    app_name: str = "StatementGuard"
    app_version: str = "1.0.0"
    app_description: str = "PTSTMT Validation Tools"
    
    # Default date ranges
    default_from_date: str = "2025-10-16"
    default_until_date: str = "2025-11-15"
    
    # File settings
    default_file_extension: str = ".txt"
    supported_file_types: tuple = (("Text Files", "*.txt"),)
    
    # UI settings
    window_title: str = "StatementGuard - PTSTMT Validation Tools"
    window_size: str = "1200x800"
    window_min_size: str = "1000x600"
    
    # Table settings
    default_page_size: int = 50
    
    # Card types
    card_types: tuple = ("REGULAR", "CORPORATE")
    default_card_type: str = "REGULAR"
    
    # Paths
    @property
    def icon_path(self) -> str:
        """Get the path to the application icon."""
        if hasattr(self, '_icon_path'):
            return self._icon_path
        
        # Try to find icon path
        base_path = os.path.dirname(os.path.abspath(__file__))
        icon_path = os.path.join(base_path, '..', 'assets', 'icon', 'StatementGuard.ico')
        
        if os.path.exists(icon_path):
            self._icon_path = icon_path
            return icon_path
        
        return ""
    
    def set_icon_path(self, path: str):
        """Set custom icon path."""
        self._icon_path = path


# Global configuration instance
config = AppConfig()
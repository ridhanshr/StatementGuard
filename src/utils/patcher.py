"""
Patcher Utility for StatementGuard
Detects and fixes structural issues in PTSTMT files.
"""

import os

class PTSTMTPatcher:
    """Class to handle detection and fixing of structural issues in PTSTMT files."""
    
    @staticmethod
    def detect_issues(file_path):
        """
        Detect structural issues in the file.
        Returns a list of issue objects: { "line": int, "type": str, "description": str, "fixable": bool }
        """
        issues = []
        try:
            with open(file_path, "r", encoding="latin-1") as f:
                last_type = None
                line_count = 0
                
                # State tracking
                in_customer = False
                in_block = False # Started with 02 or 03
                
                for line in f:
                    line_count += 1
                    rtype = line[:2]
                    
                    if rtype == "01":
                        # If we were in a block and didn't see an 04, it's missing
                        if in_block:
                            issues.append({
                                "line": line_count,
                                "type": "MISSING_04",
                                "description": f"Missing '04' record before new customer at line {line_count}",
                                "fixable": True
                            })
                        in_customer = True
                        in_block = False
                    
                    elif rtype in ["02", "03"]:
                        if not in_customer:
                            issues.append({
                                "line": line_count,
                                "type": "ORPHAN_BLOCK",
                                "description": f"Record '{rtype}' found outside customer '01' block at line {line_count}",
                                "fixable": False
                            })
                        
                        # Check for missing 04 if we see a new 02 (new card/sub-block)
                        if rtype == "02" and in_block:
                             issues.append({
                                "line": line_count,
                                "type": "MISSING_04",
                                "description": f"Missing '04' record before new header '02' at line {line_count}",
                                "fixable": True
                            })
                        
                        in_block = True
                    
                    elif rtype == "04":
                        if not in_block:
                            issues.append({
                                "line": line_count,
                                "type": "UNEXPECTED_04",
                                "description": f"Unexpected '04' record without preceding '02'/'03' at line {line_count}",
                                "fixable": False
                            })
                        in_block = False
                    
                    last_type = rtype
                
                # Check end of file
                if in_block:
                    issues.append({
                        "line": line_count + 1,
                        "type": "MISSING_04_EOF",
                        "description": "Missing '04' record at end of file",
                        "fixable": True
                    })
                    
        except Exception as e:
            issues.append({
                "line": 0,
                "type": "ERROR",
                "description": f"Error reading file: {str(e)}",
                "fixable": False
            })
            
        return issues

    @staticmethod
    def apply_fixes(file_path, output_path, issues):
        """
        Apply fixes based on detected issues.
        Currently supports fixing missing '04' records.
        """
        if not issues:
            return False
            
        # Filter fixable issues and sort by line descending to avoid index shift issues?
        # Actually, since we are writing a new file stream, we should sort by line ascending.
        fixable_issues = [i for i in issues if i["fixable"]]
        if not fixable_issues:
            return False
            
        # Map line numbers to fixes
        fix_map = {i["line"]: i for i in fixable_issues}
        
        try:
            with open(file_path, "r", encoding="latin-1") as fin:
                with open(output_path, "w", encoding="latin-1") as fout:
                    line_count = 0
                    for line in fin:
                        line_count += 1
                        
                        # If there's a missing 04 at this line, it means it should have come BEFORE this line
                        if line_count in fix_map and fix_map[line_count]["type"] == "MISSING_04":
                            # Insert 04 record (padded to 1000 chars as per typical PTSTMT)
                            fout.write("04".ljust(1000) + "\n")
                            
                        fout.write(line)
                    
                    # Check EOF fix
                    if (line_count + 1) in fix_map and fix_map[line_count + 1]["type"] == "MISSING_04_EOF":
                         fout.write("04".ljust(1000) + "\n")
                         
            return True
        except Exception as e:
            print(f"Error applying fixes: {e}")
            return False

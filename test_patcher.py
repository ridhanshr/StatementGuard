"""
Test the patcher utility against a simulated broken PTSTMT file.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.utils.patcher import PTSTMTPatcher

def create_test_file(path, lines):
    with open(path, "w", encoding="latin-1") as f:
        for line in lines:
            f.write(line.ljust(1000) + "\n")

def read_types(path):
    types = []
    with open(path, "r", encoding="latin-1") as f:
        for line in f:
            types.append(line[:2])
    return types

def test_missing_04():
    """Test: customer block missing a closing 04"""
    test_file = "test_patch_input.txt"
    patched_file = "test_patch_input_patched.txt"
    
    # Broken structure: 01 -> 02 -> 03 -> (missing 04) -> 01 -> 02 -> 03 -> 04
    create_test_file(test_file, ["01", "02", "03", "01", "02", "03", "04"])
    
    print("=== Test: Missing 04 ===")
    issues = PTSTMTPatcher.detect_issues(test_file)
    print(f"Issues detected: {len(issues)}")
    for i in issues:
        print(f"  Line {i['line']}: {i['type']} - {i['description']} (fixable: {i['fixable']})")
    
    fixable = [i for i in issues if i["fixable"]]
    print(f"Fixable: {len(fixable)}")
    
    success = PTSTMTPatcher.apply_fixes(test_file, patched_file, issues)
    print(f"Patch applied: {success}")
    
    if success:
        result_types = read_types(patched_file)
        print(f"Original types: 01, 02, 03, 01, 02, 03, 04")
        print(f"Patched types:  {', '.join(result_types)}")
        
        # Verify: should be 01 02 03 04 01 02 03 04
        expected = ["01", "02", "03", "04", "01", "02", "03", "04"]
        assert result_types == expected, f"Expected {expected}, got {result_types}"
        print("[PASS] Structure fixed correctly!")
    
    # Cleanup
    os.remove(test_file)
    if os.path.exists(patched_file):
        os.remove(patched_file)

def test_missing_04_eof():
    """Test: missing 04 at end of file"""
    test_file = "test_patch_eof.txt"
    patched_file = "test_patch_eof_patched.txt"
    
    # Broken structure: 01 -> 02 -> 03 -> (missing 04 at EOF)
    create_test_file(test_file, ["01", "02", "03"])
    
    print("\n=== Test: Missing 04 at EOF ===")
    issues = PTSTMTPatcher.detect_issues(test_file)
    print(f"Issues detected: {len(issues)}")
    for i in issues:
        print(f"  Line {i['line']}: {i['type']} - {i['description']} (fixable: {i['fixable']})")
    
    success = PTSTMTPatcher.apply_fixes(test_file, patched_file, issues)
    print(f"Patch applied: {success}")
    
    if success:
        result_types = read_types(patched_file)
        print(f"Patched types: {', '.join(result_types)}")
        expected = ["01", "02", "03", "04"]
        assert result_types == expected, f"Expected {expected}, got {result_types}"
        print("[PASS] EOF fix applied correctly!")
    
    os.remove(test_file)
    if os.path.exists(patched_file):
        os.remove(patched_file)

def test_valid_file():
    """Test: a valid file should have no fixable issues"""
    test_file = "test_patch_valid.txt"
    
    create_test_file(test_file, ["01", "02", "03", "04"])
    
    print("\n=== Test: Valid File (No Issues) ===")
    issues = PTSTMTPatcher.detect_issues(test_file)
    print(f"Issues detected: {len(issues)}")
    assert len(issues) == 0, f"Expected 0 issues, got {len(issues)}"
    print("[PASS] Valid file has no issues!")
    
    os.remove(test_file)

if __name__ == "__main__":
    test_missing_04()
    test_missing_04_eof()
    test_valid_file()
    print("\n=== ALL TESTS PASSED ===")

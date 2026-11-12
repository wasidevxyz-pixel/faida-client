
import os

files = [
    r'd:\BAS-LIVE\BAS-SOFTWARE\Frontend\public\js\wh-purchase.js',
    r'd:\BAS-LIVE\BAS-SOFTWARE\Frontend\public\js\wh-purchase-return.js'
]

def fix_file(file_path):
    with open(file_path, 'rb') as f:
        content = f.read()
    
    # Simple check for null bytes which indicate UTF-16 usually
    if b'\x00' in content:
        # Try to decode as utf-16le and re-encode as utf-8
        try:
            # We might have a mix of utf-8 and utf-16 if we appended
            # Let's try to find the start of the corrupted part
            # Or just filter out null bytes if it's mostly ascii
            new_content = content.replace(b'\x00', b'')
            # Also fix formatting if needed
            with open(file_path, 'wb') as f:
                f.write(new_content)
            print(f"Fixed {file_path}")
        except Exception as e:
            print(f"Error fixing {file_path}: {e}")

for f in files:
    fix_file(f)

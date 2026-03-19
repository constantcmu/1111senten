import re
import json

try:
    with open('c:\\Users\\LEGION\\GeminiCLI101\\1111senten\\fill.json', 'r', encoding='utf-8') as f:
        text = f.read()
    
    # Try parsing the JSON
    json_start = text.find('[')
    json_end = text.rfind(']') + 1
    
    if json_start != -1 and json_end != -1:
        json_str = text[json_start:json_end]
        data = json.loads(json_str)
        print("Valid JSON parsed. Count =", len(data))
    else:
        # Fallback to regex
        count = len(re.findall(r'"id"\s*:', text))
        print("Fallback regex count =", count)
        
except Exception as e:
    print("Error:", e)
    
    # Ultimate fallback regex
    try:
        with open('c:\\Users\\LEGION\\GeminiCLI101\\1111senten\\fill.json', 'r', encoding='utf-8', errors='replace') as f:
            text = f.read()
        count = len(re.findall(r'"id"\s*:', text))
        print("Super fallback regex count =", count)
    except Exception as e2:
        print("Super error:", e2)

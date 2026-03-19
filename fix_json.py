import re
import json

file_path = r'c:\Users\LEGION\GeminiCLI101\1111senten\fill.json'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

# Make sure it only acts on top-level objects by relying on the fact there are no nested dicts
fixed_text = re.sub(r'\}\s*\{', '},\n    {', text)

# Strip out markdown from start and end
if '```json' in fixed_text:
    json_start = fixed_text.find('[')
    if json_start != -1:
        # Also could be markdown at the end
        json_end = fixed_text.rfind(']') + 1
        json_str = fixed_text[json_start:json_end]
        
        try:
            data = json.loads(json_str)
            print("Successfully fixed and parsed JSON. Length:", len(data))
            
            # Now format and write the exact fixed JSON back, preserving the content
            # Wait, the user might want the top comments back, so let's just write `fixed_text` back 
            # and check if `fixed_text[json_start:json_end]` is valid.
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(fixed_text)
            print("Written fixed text back to fill.json")
        except json.JSONDecodeError as e:
            print("Still invalid after fixing:", e)
    else:
        print("Couldn't find JSON array brackets.")
else:
    # No markdown found at all?
    try:
        data = json.loads(fixed_text)
        print("Successfully fixed and parsed pure JSON. Length:", len(data))
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(fixed_text)
    except Exception as e:
        print("Still invalid after fixing (pure):", e)

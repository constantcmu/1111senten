import json

file_path = r'c:\Users\LEGION\GeminiCLI101\1111senten\fill.json'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

start_bracket = text.find('[')
end_bracket = text.rfind(']') + 1

header = text[:start_bracket]
footer = text[end_bracket:]
json_str = text[start_bracket:end_bracket]

data = json.loads(json_str)

new_data = []
seen_en = set()
removed = []

for item in data:
    en_key = item['en'].strip().lower()
    
    # Let's consider items with the same English text as duplicates
    if en_key in seen_en:
        removed.append(item)
        continue
        
    seen_en.add(en_key)
    new_data.append(item)

print(f"Original count: {len(data)}")
print(f"Removed exact EN sentences count: {len(removed)}")
print(f"Items remaining: {len(new_data)}")

# Now we should have 1111 remaining. Let's reassign IDs
for i, item in enumerate(new_data):
    item['id'] = i + 1

# Write back
formatted_json = json.dumps(new_data, ensure_ascii=False, indent=4)
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(header + formatted_json + footer)

print("Saved cleanly to fill.json")

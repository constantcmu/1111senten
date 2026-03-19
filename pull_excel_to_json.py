import pandas as pd
import json
import re

excel_file = r'c:\Users\LEGION\GeminiCLI101\1111senten\1111_sentences_full.xlsx'
safe_json_ref = r'c:\Users\LEGION\GeminiCLI101\1111senten\data_with_highlights.bak.json'
output_json = r'c:\Users\LEGION\GeminiCLI101\1111senten\fill.json'

df = pd.read_excel(excel_file)
# Find actual column names in case they differ slightly
cols = list(df.columns)
id_col = cols[0]
en_col = cols[1]
ipa_col = cols[2]
th_col = cols[3]
ch_col = cols[4]
py_col = cols[5]

ref_data = {}
try:
    with open(safe_json_ref, 'r', encoding='utf-8') as f:
        bak_list = json.load(f)
        for item in bak_list:
            ref_data[item.get('id', 0)] = item
except Exception as e:
    print(f"Could not load backup for groups: {e}")

new_data = []

def extract_highlights(text):
    return re.findall(r'<span>(.*?)</span>', str(text), re.IGNORECASE)

def apply_highlights(text, words):
    if not isinstance(text, str): return text
    for word in words:
        if not word: continue
        pattern = re.compile(r'\b{}\b'.format(re.escape(word)), re.IGNORECASE)
        # If \b fails, try without \b just in case
        if not pattern.search(text):
            pattern = re.compile(re.escape(word), re.IGNORECASE)
            
        if f'<span>' not in text:
            text = pattern.sub(f'<span>{word}</span>', text, count=1)
    return text

for _, row in df.iterrows():
    sid = int(row[id_col])
    en = str(row[en_col]).strip()
    ipa = str(row[ipa_col]).strip()
    th = str(row[th_col]).strip()
    ch = str(row[ch_col]).strip()
    py = str(row[py_col]).strip()
    
    # Clean possible nan
    if en.lower() == 'nan': en = ""
    if ipa.lower() == 'nan': ipa = ""
    if th.lower() == 'nan': th = ""
    if ch.lower() == 'nan': ch = ""
    if py.lower() == 'nan': py = ""
    
    group = "General Expressions (ประโยคทั่วไปอื่นๆ)"
    highlights = []
    
    if sid in ref_data:
        ref_item = ref_data[sid]
        group = ref_item.get('group', group)
        
        if 'key' in ref_item and ref_item['key']:
            highlights = ref_item['key']
        else:
            highlights = extract_highlights(ref_item.get('en', ''))
            
    en_highlighted = apply_highlights(en, highlights)
    
    item = {
        "id": sid,
        "en": en_highlighted,
        "ipa": ipa,
        "ch": ch,
        "py": py,
        "th": th,
        "group": group,
        "key": highlights
    }
    new_data.append(item)

# Write to fill.json
with open(output_json, 'w', encoding='utf-8') as f:
    json.dump(new_data, f, ensure_ascii=False, indent=4)

print(f"Successfully pulled {len(new_data)} items from Excel and merged with highlights/groups to {output_json}!")

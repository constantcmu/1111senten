import pandas as pd
import json

excel_file = r'c:\Users\LEGION\GeminiCLI101\1111senten\1111_sentences_full.xlsx'
json_file = r'c:\Users\LEGION\GeminiCLI101\1111senten\fill.json'
output_log = r'c:\Users\LEGION\GeminiCLI101\1111senten\compare_log.txt'

try:
    # 1. Load Excel
    df = pd.read_excel(excel_file)
    
    # Identify the English sentence column
    # We will assume it might be named 'en', 'English', etc.
    cols = [str(c).lower() for c in df.columns]
    en_col = df.columns[0] # Fallback to first column
    for col in df.columns:
        if 'en' in str(col).lower() or 'english' in str(col).lower():
            en_col = col
            break
            
    excel_sentences = df[en_col].dropna().astype(str).str.strip().tolist()
    
    # Strip spans if they were brought over, but usually Excel strings don't have HTML
    # We'll normalize for matching
    import re
    def normalize(text):
        # Remove HTML tags like <span>
        text = re.sub(r'<[^>]+>', '', text)
        return text.strip().lower()

    excel_normalized = [normalize(s) for s in excel_sentences]
    
    # Find duplicates in Excel natively?
    from collections import Counter
    excel_counts = Counter(excel_normalized)
    excel_dupes = {k: v for k, v in excel_counts.items() if v > 1}
    
    # 2. Load JSON
    with open(json_file, 'r', encoding='utf-8') as f:
        text = f.read()
    
    start_bracket = text.find('[')
    end_bracket = text.rfind(']') + 1
    json_str = text[start_bracket:end_bracket]
    data = json.loads(json_str)
    
    json_normalized = [normalize(item['en']) for item in data]
    json_counts = Counter(json_normalized)
    json_dupes = {k: v for k, v in json_counts.items() if v > 1}
    
    excel_set = set(excel_normalized)
    json_set = set(json_normalized)
    
    missing_in_json = excel_set - json_set
    extra_in_json = json_set - excel_set
    
    report = []
    report.append(f"Excel File Length: {len(excel_sentences)}")
    report.append(f"Excel Unique Sentences: {len(excel_set)}")
    if excel_dupes:
        report.append(f"Excel has {len(excel_dupes)} duplicated sentences.")
        
    report.append(f"JSON File Length: {len(data)}")
    report.append(f"JSON Unique Sentences: {len(json_set)}")
    if json_dupes:
        report.append(f"JSON has {len(json_dupes)} duplicated sentences.")
        
    report.append(f"--- Differences ---")
    report.append(f"Sentences in Excel but MISSING in JSON: {len(missing_in_json)}")
    for s in sorted(list(missing_in_json))[:20]:
        report.append(f"  - {s}")
        
    report.append(f"Sentences in JSON but NOT in Excel: {len(extra_in_json)}")
    for s in sorted(list(extra_in_json))[:20]:
        report.append(f"  - {s}")
        
    with open(output_log, 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))

except Exception as e:
    with open(output_log, 'w', encoding='utf-8') as f:
        f.write(f"Error occurred: {str(e)}")


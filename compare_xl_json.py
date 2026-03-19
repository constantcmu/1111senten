import pandas as pd
import json
import re

def clean_all_spaces(text):
    if not isinstance(text, str): return ""
    # Remove HTML tags and ALL whitespace
    text = re.sub(r'<[^>]*>', '', text)
    return re.sub(r'\s+', '', text).strip()

def compare():
    # Load Excel
    df = pd.read_excel('1111_sentences_full.xlsx')
    
    # Load Backup JSON
    with open('data_with_highlights.bak.json', 'r', encoding='utf-8') as f:
        json_data = json.load(f)
    
    mismatches = []
    
    for i, item in enumerate(json_data):
        if i >= len(df): break
        
        sid = item['id']
        xl_en = clean_all_spaces(df.iloc[i, 1])
        xl_th = clean_all_spaces(df.iloc[i, 3])
        xl_ch = clean_all_spaces(df.iloc[i, 4])
        
        js_en = clean_all_spaces(item['en'])
        js_th = clean_all_spaces(item['th'])
        js_ch = clean_all_spaces(item['ch'])
        
        diffs = []
        if xl_en != js_en: diffs.append("English")
        if xl_th != js_th: diffs.append("Thai")
        if xl_ch != js_ch: diffs.append("Chinese")
        
        if diffs:
            mismatches.append({
                "id": sid,
                "fields": diffs,
                "xl": {"en": df.iloc[i, 1], "th": df.iloc[i, 3], "ch": df.iloc[i, 4]},
                "js": {"en": item['en'], "th": item['th'], "ch": item['ch']}
            })

    print(f"📊 Comparison Results (Excel vs Backup JSON):")
    print(f"Total Sentences Checked: {len(json_data)}")
    print(f"Total Mismatches Found: {len(mismatches)}")
    print("-" * 50)
    
    if mismatches:
        print(f"First 10 Mismatches Examples:")
        for m in mismatches[:10]:
            print(f"❌ ID {m['id']} - Diff in: {', '.join(m['fields'])}")
            if "Thai" in m['fields']:
                print(f"   [TH] XL: \"{m['xl']['th']}\" | JS: \"{m['js']['th']}\"")
            if "English" in m['fields']:
                print(f"   [EN] XL: \"{m['xl']['en']}\" | JS: \"{m['js']['en']}\"")
            print("")
    else:
        print("✅ Everything matches perfectly!")

if __name__ == "__main__":
    compare()

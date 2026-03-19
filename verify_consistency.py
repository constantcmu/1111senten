import json
import re

def check_consistency():
    with open('data_with_highlights.txt', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    reports = []
    
    for item in data:
        sid = item['id']
        en = item['en'].replace('<span>', '').replace('</span>', '').lower()
        th = item['th']
        ch = item['ch']
        
        # 1. Check for empty values
        if not en or not th or not ch:
            reports.append(f"ID {sid}: Missing data in one of the languages.")
            continue
            
        # 2. Length-based heuristic (e.g., English ID 203 issue)
        # If English is very long but Chinese is just 1-2 chars
        if len(en) > 30 and len(ch) < 4:
            reports.append(f"ID {sid}: Mismatch suspicious! EN is long ('{en[:20]}...'), but CH is very short ('{ch}').")

        # 3. Specific Keyword Check (if possible)
        # Example: if 'worth' is in EN, 'คุ้ม' or '值' should be in TH/CH
        if 'worth' in en:
            if 'คุ้ม' not in th and '值' not in ch:
                reports.append(f"ID {sid}: Keyword 'worth' missing in translations.")
        
        if 'allergic' in en:
            if 'แพ้' not in th and '过敏' not in ch:
                reports.append(f"ID {sid}: Keyword 'allergic' missing in translations.")

    return reports

if __name__ == "__main__":
    results = check_consistency()
    print(f"Total Sentences: 1111")
    print(f"Suspected Errors Found: {len(results)}")
    print("-" * 30)
    for r in results[:15]:
        print(f"❌ {r}")
    if len(results) > 15:
        print(f"... and {len(results)-15} more.")

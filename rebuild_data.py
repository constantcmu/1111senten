import pandas as pd
import json
import os
import re

# File Paths
EXCEL_FILE = '1111_sentences_full.xlsx'
JSON_FILE = 'data_with_highlights.txt'
BACKUP_FILE = 'data_with_highlights.bak.json'

def extract_highlights(text):
    """Extract words inside <span> tags."""
    return re.findall(r'<span>(.*?)</span>', str(text), re.IGNORECASE)

def apply_highlights(text, words):
    """Re-apply <span> tags to words in text."""
    if not isinstance(text, str): return text
    for word in words:
        if not word: continue
        # Use regex to find the word safely (avoiding nested spans)
        pattern = re.compile(re.escape(word), re.IGNORECASE)
        # Only replace if not already wrapped
        if f'<span>{word}</span>'.lower() not in text.lower():
            text = pattern.sub(f'<span>{word}</span>', text)
    return text

def rebuild():
    # 1. Load Excel
    print(f"📖 Reading {EXCEL_FILE}...")
    df_xl = pd.read_excel(EXCEL_FILE)
    # Map columns to internal names
    # ['ลำดับ', 'English', 'IPA', 'Thai', 'Chinese', 'Pinyin']
    df_xl = df_xl.rename(columns={
        'ลำดับ': 'id',
        'English': 'en',
        'IPA': 'ipa',
        'Thai': 'th',
        'Chinese': 'ch',
        'Pinyin': 'py'
    })

    # 2. Load Existing JSON (for Group & Highlights)
    existing_data = {}
    if os.path.exists(JSON_FILE):
        print(f"📂 Loading existing {JSON_FILE} for reference...")
        with open(JSON_FILE, 'r', encoding='utf-8') as f:
            old_list = json.load(f)
            for item in old_list:
                existing_data[item['id']] = item
        
        # Backup old file
        with open(BACKUP_FILE, 'w', encoding='utf-8') as f:
            json.dump(old_list, f, ensure_ascii=False, indent=2)

    # 3. Process Rows
    new_data = []
    discrepancies = []

    for _, row in df_xl.iterrows():
        sid = int(row['id'])
        en = str(row['en']).strip()
        ipa = str(row['ipa']).strip()
        th = str(row['th']).strip()
        ch = str(row['ch']).strip()
        py = str(row['py']).strip()
        
        # Default group
        group = "General Expressions (ประโยคทั่วไปอื่นๆ)"
        highlights = []

        if sid in existing_data:
            ref = existing_data[sid]
            group = ref.get('group', group)
            # Try to recover highlights from English
            highlights = extract_highlights(ref.get('en', ''))
            
            # Simple check for discrepancies (Length ratio or common markers)
            # If English is very short but Chinese is very long, flag it
            if len(en) > 0:
                ratio_ch = len(ch) / len(en)
                if ratio_ch > 4 or ratio_ch < 0.1:
                    discrepancies.append(f"ID {sid}: Length mismatch (EN: {len(en)}, CH: {len(ch)})")

        # Apply highlights to the new English text
        en_highlighted = apply_highlights(en, highlights)

        new_data.append({
            "id": sid,
            "en": en_highlighted,
            "ipa": ipa,
            "ch": ch,
            "py": py,
            "th": th,
            "group": group,
            "key": highlights
        })

    # 4. Save New JSON
    print(f"💾 Saving {len(new_data)} sentences to {JSON_FILE}...")
    with open(JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)

    # 5. Report Discrepancies
    if discrepancies:
        print("\n⚠️ Potential Issues Found:")
        for d in discrepancies[:10]: # Show first 10
            print(f"  - {d}")
        if len(discrepancies) > 10:
            print(f"  ... and {len(discrepancies)-10} more.")
    else:
        print("\n✅ All sentences processed. No major length discrepancies found.")

if __name__ == "__main__":
    rebuild()

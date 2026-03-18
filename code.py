import json
import re
import os

file_name = 'data_with_highlights.txt'

if not os.path.exists(file_name):
    print(f"❌ Error: ไม่พบไฟล์ '{file_name}'")
    exit(1)

print(f"กำลังสกัดคำสำคัญจาก <span> ในไฟล์ '{file_name}'...")

# อ่านไฟล์ JSON
with open(file_name, 'r', encoding='utf-8') as f:
    data = json.load(f)

# ดึงคำที่อยู่ใน <span>...</span> มาใส่ใน "key"
for row in data:
    extracted_keys = []
    for lang in ['en', 'ipa', 'ch', 'py', 'th']:
        text = row.get(lang, '')
        # หาคำทั้งหมดที่ถูกครอบด้วย <span>...</span>
        matches = re.findall(r'<span>(.*?)</span>', str(text), re.IGNORECASE)
        for match in matches:
            clean_word = match.strip()
            if clean_word and clean_word not in extracted_keys:
                extracted_keys.append(clean_word)
    
    row['key'] = extracted_keys

# บันทึกทับไฟล์เดิม
with open(file_name, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("✅ อัปเดต 'key' สำเร็จแล้ว! (สกัดจาก Tag <span> โดยตรง ไม่ต้องใช้ AI แปลภาษา)")
import pandas as pd
import json

excel_file = r'c:\Users\LEGION\GeminiCLI101\1111senten\1111_sentences_full.xlsx'
df = pd.read_excel(excel_file)

output = []
output.append(f"Columns: {list(df.columns)}")
output.append("First Row:")
first_row = df.head(1).to_dict(orient='records')[0]
output.append(json.dumps(first_row, indent=2, ensure_ascii=False, default=str))

with open(r'c:\Users\LEGION\GeminiCLI101\1111senten\excel_head.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(output))

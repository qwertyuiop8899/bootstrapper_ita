import json

try:
    with open('public/preset.json', 'r') as f:
        content = f.read()
        json.loads(content)
        print("JSON is valid")
except json.JSONDecodeError as e:
    print(f"JSON error: {e}")
    lines = content.splitlines()
    error_line = e.lineno - 1
    start = max(0, error_line - 5)
    end = min(len(lines), error_line + 5)
    print("Context:")
    for i in range(start, end):
        print(f"{i+1}: {lines[i]}")

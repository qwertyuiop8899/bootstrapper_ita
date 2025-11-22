
with open('public/preset.json', 'r') as f:
    lines = f.readlines()

balance = 0
for i, line in enumerate(lines):
    for char in line:
        if char == '{':
            balance += 1
        elif char == '}':
            balance -= 1
    
    if balance < 0:
        print(f"Balance went negative at line {i+1}: {line.strip()}")
        break

print(f"Final balance: {balance}")
if balance > 0:
    print("Missing closing braces.")
elif balance < 0:
    print("Too many closing braces.")
else:
    print("Balanced.")

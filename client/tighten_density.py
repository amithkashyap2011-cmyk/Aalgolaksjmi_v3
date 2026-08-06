import os
import re

directory = '/Users/amithks/aalgolakshmi_v2/client/src/components/dashboard'

replacements = [
    (r'\bp-4\b', 'p-2'),
    (r'\bp-3\b', 'p-2'),
    (r'\bgap-4\b', 'gap-2'),
    (r'\bgap-3\b', 'gap-2'),
]

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            path = os.path.join(root, file)
            with open(path, 'r') as f:
                content = f.read()
            
            new_content = content
            for pattern, repl in replacements:
                new_content = re.sub(pattern, repl, new_content)
            
            if new_content != content:
                with open(path, 'w') as f:
                    f.write(new_content)
                print(f'Tightened {path}')

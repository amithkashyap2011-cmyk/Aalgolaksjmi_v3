import os
import re

directories = ['/Users/amithks/aalgolakshmi_v2/client/src/components', '/Users/amithks/aalgolakshmi_v2/client/src/pages']

replacements = [
    (r'bg-black/(\d+)', r'bg-terminal-950'),
    (r'bg-black\b', r'bg-terminal-950'),
    (r'bg-\[\#0b1120\](/\d+)?', r'bg-terminal-900'),
    (r'bg-\[\#020617\](/\d+)?', r'bg-terminal-900'),
    (r'bg-\[\#0b0c1e\](/\d+)?', r'bg-terminal-900'),
    (r'bg-slate-900(/\d+)?', r'bg-terminal-950'),
    (r'border-white/(\d+)', r'border-terminal-800'),
    (r'border-slate-800(/\d+)?', r'border-terminal-800'),
    (r'backdrop-blur-md', r''),
    (r'backdrop-blur-sm', r''),
    (r'backdrop-blur-2xl', r''),
    (r'shadow-2xl', r'shadow-sm'),
    (r'shadow-\[.*?\]', r'shadow-sm'),
    (r'rounded-3xl', r'rounded-xl'),
    (r'rounded-2xl', r'rounded-xl'),
    (r'text-white', r'text-slate-100'), # Safely map hardcoded white text to the global text token
]

for d in directories:
    for root, _, files in os.walk(d):
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
                    print(f'Updated {path}')

import glob, os

for path in glob.glob('C:/Users/josho/SofritoStudio/deploy/*.html'):
    with open(path, 'r') as f:
        content = f.read()
    # Only add if not already present
    if 'agents.css' not in content:
        # Insert after the last </link> in <head> or before </head>
        if '</head>' in content:
            content = content.replace('</head>', '<link rel="stylesheet" href="css/agents.css">\n</head>')
            with open(path, 'w') as f:
                f.write(content)
            print('Added agents.css to:', os.path.basename(path))
        else:
            print('No </head> found in:', os.path.basename(path))

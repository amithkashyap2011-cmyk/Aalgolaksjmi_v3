with open('/Users/amithks/aalgolakshmi_v2/client/src/components/chart/AISignalOverlay.tsx', 'r') as f:
    text = f.read()

text = text.replace('text-indigo-300', 'text-indigo-700')
text = text.replace('text-indigo-400', 'text-indigo-700')
text = text.replace('text-indigo-100', 'text-indigo-800')
text = text.replace('bg-indigo-500/20', 'bg-indigo-100')
text = text.replace('border-indigo-500/30', 'border-indigo-300')
text = text.replace('text-indigo-400/80', 'text-indigo-700')
text = text.replace('bg-indigo-950/40', 'bg-indigo-50')
text = text.replace('text-indigo-200/60', 'text-indigo-800')
text = text.replace('bg-indigo-900/10', 'bg-indigo-100/50')
text = text.replace('bg-indigo-500/30', 'bg-indigo-200')
text = text.replace('text-emerald-300', 'text-emerald-700')
text = text.replace('from-indigo-600 to-sky-400', 'from-indigo-500 to-sky-500')

with open('/Users/amithks/aalgolakshmi_v2/client/src/components/chart/AISignalOverlay.tsx', 'w') as f:
    f.write(text)

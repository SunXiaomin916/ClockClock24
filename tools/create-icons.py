"""Optional asset regeneration; packaging uses the committed PNG/ICO/ICNS files."""
from pathlib import Path
from PIL import Image, ImageDraw
folder = Path(__file__).resolve().parents[1] / 'desktop' / 'assets'
folder.mkdir(parents=True, exist_ok=True)
im = Image.new('RGBA', (1024,1024))
d = ImageDraw.Draw(im)
d.rounded_rectangle((24,24,1000,1000),radius=216,fill='#e9e5dd')
for x,y,ends in [(312,312,((0,140),(140,0))),(712,312,((-140,0),(0,140))),(312,712,((0,-140),(140,0))),(712,712,((0,-140),(-140,0)))]:
    d.ellipse((x-173,y-173,x+173,y+173),fill='#a6a398')
    d.ellipse((x-169,y-165,x+169,y+173),fill='#f9f7f0')
    d.ellipse((x-161,y-157,x+161,y+157),fill='#ddd9d0')
    for dx,dy in ends:d.line((x,y,x+dx,y+dy),fill='#282b2d',width=24)
    d.ellipse((x-12,y-12,x+12,y+12),fill='#282b2d')
im.save(folder/'icon.png')
im.save(folder/'icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
im.save(folder/'icon.icns')
for template in [False,True]:
    tray=Image.new('RGBA',(64,64));draw=ImageDraw.Draw(tray)
    if not template:draw.ellipse((3,3,61,61),fill='#f2f0eb')
    color='#000000' if template else '#252624'
    draw.ellipse((8,8,56,56),outline=color,width=5)
    draw.line((32,17,32,32,46,32),fill=color,width=5)
    tray.resize((32,32),Image.Resampling.LANCZOS).save(folder/('trayTemplate.png' if template else 'tray.png'))

"""Make a synthetic electrical plan (PDF) plus ground truth, to test auto count without real prints.
Usage: python3 gen_synthetic.py OUT_DIR [seed]
Writes plan.pdf and truth.json: {"symbols": {"duplex": [[x,y],...], ...}, "sample": {"duplex": [x,y,w,h]}} in PDF points, y down."""
import json, math, random, sys
from reportlab.pdfgen import canvas

out = sys.argv[1]; seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1
random.seed(seed)
W, H = 36 * 72, 24 * 72
c = canvas.Canvas(f"{out}/plan.pdf", pagesize=(W, H))
def Y(y): return H - y  # y-down to PDF
truth = {"duplex": [], "switch": [], "light": []}
isolated = {"duplex": [], "switch": [], "light": []}  # unrotated, nowhere near a wall: good sample candidates

# walls: rooms grid
c.setLineWidth(3)
for i in range(0, 5):
    c.line(120 + i * 560, Y(120), 120 + i * 560, Y(1500))
for j in range(0, 4):
    c.line(120, Y(120 + j * 460), 2360, Y(120 + j * 460))
c.setLineWidth(0.8)
for _ in range(60):  # clutter: dimension lines, hatch, random short lines
    x, y = random.uniform(100, 2400), random.uniform(100, 1550)
    c.line(x, Y(y), x + random.uniform(-80, 80), Y(y + random.uniform(-40, 40)))
c.setFont("Helvetica", 11)
for k in range(40):
    c.drawString(random.uniform(100, 2300), Y(random.uniform(100, 1550)), random.choice(["ROOM 101", "OFFICE", "CORR.", "12'-6\"", "EQ", "TYP", "NOTE 3"]))

def duplex(x, y, rot=0):
    c.saveState(); c.translate(x, Y(y)); c.rotate(rot); c.setLineWidth(1.2)
    c.circle(0, 0, 8, stroke=1, fill=0); c.line(-5, -3, 5, -3); c.line(-5, 3, 5, 3); c.restoreState()
def switch(x, y, rot=0):
    c.saveState(); c.translate(x, Y(y)); c.rotate(rot); c.setLineWidth(1.2)
    c.setFont("Helvetica-Bold", 14); c.drawString(-5, -5, "S"); c.line(0, 8, 0, 14); c.line(0, -8, 0, -14); c.restoreState()
def light(x, y, rot=0):
    c.saveState(); c.translate(x, Y(y)); c.rotate(rot); c.setLineWidth(1.2)
    c.circle(0, 0, 9, stroke=1, fill=0); c.line(-6.4, -6.4, 6.4, 6.4); c.line(-6.4, 6.4, 6.4, -6.4); c.restoreState()

def place(fn, name, n, near_wall=0.4):
    for _ in range(n):
        for _try in range(50):
            if random.random() < near_wall:  # attached to a wall line
                x = 120 + random.randint(0, 4) * 560 + random.choice([-1, 1]) * 11; y = random.uniform(150, 1450)
            else:
                x, y = random.uniform(150, 2330), random.uniform(150, 1480)
            if all(math.hypot(x - a, y - b) > 40 for v in truth.values() for a, b in v): break
        rot = random.choice([0, 90, 180, 270]) if random.random() < 0.3 else 0
        fn(x, y, rot); truth[name].append([round(x, 1), round(y, 1)])
        if rot == 0 and all(abs(x - (120 + i * 560)) > 30 for i in range(5)) and all(abs(y - (120 + j * 460)) > 30 for j in range(4)): isolated[name].append([round(x, 1), round(y, 1)])
place(duplex, "duplex", 70); place(switch, "switch", 30); place(light, "light", 50, 0.0)
c.save()
sample = {k: [isolated[k][0][0] - 14, isolated[k][0][1] - 14, 28, 28] for k in truth}
json.dump({"symbols": truth, "sample": sample, "sheet": [W, H]}, open(f"{out}/truth.json", "w"))
print({k: len(v) for k, v in truth.items()})

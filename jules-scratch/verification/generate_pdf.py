from fpdf import FPDF
import base64

pdf = FPDF()
pdf.add_page()
pdf.set_font("Helvetica", size=12)
pdf.cell(200, 10, text="Hello, this is a test PDF.", new_x="LMARGIN", new_y="NEXT", align="C")
pdf_bytes = pdf.output()

base64_pdf = base64.b64encode(pdf_bytes).decode('utf-8')

with open("jules-scratch/verification/test_pdf.b64", "w") as f:
    f.write(base64_pdf)

from fpdf import FPDF

pdf = FPDF()

# Page 1
pdf.add_page()
pdf.set_font("Arial", size=12)
pdf.cell(200, 10, txt="This is Page 1.", ln=1, align="C")

# Page 2
pdf.add_page()
pdf.set_font("Arial", size=12)
pdf.cell(200, 10, txt="This is Page 2.", ln=1, align="C")

# Page 3
pdf.add_page()
pdf.set_font("Arial", size=12)
pdf.cell(200, 10, txt="This is Page 3.", ln=1, align="C")

pdf.output("test.pdf")

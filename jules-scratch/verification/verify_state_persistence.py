from playwright.sync_api import sync_playwright
import base64
import os

def run(playwright):
    # Read the base64 string from the file
    with open("jules-scratch/verification/test_pdf.b64", "r") as f:
        base64_pdf = f.read()

    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Get the absolute path to the index.html file
    index_path = os.path.abspath('index.html')

    # Navigate to the local HTML file
    page.goto(f'file://{index_path}')

    # Decode the base64 string and set it as the input for the file chooser
    pdf_bytes = base64.b64decode(base64_pdf)

    # Set the file for the input element
    page.locator("#file-input").set_input_files(
        files=[{"name": "test.pdf", "mimeType": "application/pdf", "buffer": pdf_bytes}]
    )

    # Wait for the first canvas to be rendered.
    page.wait_for_selector('canvas', timeout=10000)

    # Add a text element
    page.locator("#text-input").fill("Persistent Text")
    page.locator("#add-text-btn").click()
    page.locator(".text-overlay").click(position={"x": 100, "y": 100})
    page.locator("#add-text-btn").click() # Exit text add mode

    # Save the text
    page.locator("#save-text-btn").click()
    page.wait_for_selector('canvas', timeout=10000)
    page.screenshot(path="jules-scratch/verification/verification-saved.png")

    # Verify the text element is still present and editable
    page.locator("div[contenteditable=true]").click()
    page.locator("#font-select").select_option("Courier")
    page.screenshot(path="jules-scratch/verification/verification-re-edited.png")


    browser.close()

with sync_playwright() as p:
    run(p)

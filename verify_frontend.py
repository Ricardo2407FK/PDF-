import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Get the absolute path to the index.html file
        file_path = os.path.abspath('index.html')
        await page.goto(f'file://{file_path}')

        # Upload the test PDF
        await page.set_input_files('input[type="file"]', 'test.pdf')

        # Wait for the PDF to be rendered
        await page.wait_for_selector('canvas')

        # Type text into the input field
        await page.fill('#text-input', 'This is a test')

        # Click the button to enter text adding mode
        await page.click('#add-text-btn')

        # Click on the canvas of the first page to place the new text
        await page.click('canvas[data-page-number="1"]')

        # Save the text
        await page.click('#save-text-btn')

        # Wait for the PDF to be re-rendered
        await page.wait_for_selector('canvas')

        # Take a screenshot for visual confirmation
        await page.screenshot(path='screenshot.png')

        await browser.close()

asyncio.run(main())

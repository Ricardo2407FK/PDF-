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

        # Verify that the welcome screen is visible
        await page.wait_for_selector('#welcome-screen')

        # Upload the test PDF using the welcome screen button
        await page.click('#welcome-upload-btn')
        await page.set_input_files('input[type="file"]#file-input', 'test.pdf')

        # Wait for the welcome screen to be hidden and the editor to be visible
        await page.wait_for_selector('#welcome-screen', state='hidden')
        await page.wait_for_selector('#content-area')
        await page.wait_for_selector('canvas')

        # Add text
        await page.click('#add-text-btn')
        await page.fill('#text-input', 'This is a test')
        await page.click('canvas[data-page-number="1"]')

        # Add an image
        await page.click('#add-image-btn')
        await page.set_input_files('input[type="file"]#image-input', 'test.png')
        await page.wait_for_selector('.image-container')

        # Add a rectangle
        await page.click('#add-rect-btn')
        await page.click('canvas[data-page-number="1"]')

        # Apply all changes
        await page.click('#apply-changes-btn')

        # Wait for the PDF to be re-rendered
        await page.wait_for_selector('canvas')

        # Take a screenshot for visual confirmation
        await page.screenshot(path='screenshot.png')

        await browser.close()

asyncio.run(main())

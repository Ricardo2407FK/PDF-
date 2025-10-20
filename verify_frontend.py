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
        await page.click('#upload-btn')
        await page.set_input_files('input[type="file"]#file-input', 'test.pdf')

        # Wait for the PDF to be rendered
        await page.wait_for_selector('canvas')

        # Click the "Draw" button
        await page.click('#draw-btn')

        # Draw a line on the first page
        drawing_canvas = await page.query_selector('.drawing-canvas[data-page-number="1"]')
        bounding_box = await drawing_canvas.bounding_box()
        await page.mouse.move(bounding_box['x'] + 20, bounding_box['y'] + 20)
        await page.mouse.down()
        await page.mouse.move(bounding_box['x'] + 100, bounding_box['y'] + 100)
        await page.mouse.up()

        # Save the drawing
        await page.click('#save-draw-btn')

        # Wait for the PDF to be re-rendered
        await page.wait_for_selector('canvas')

        # Take a screenshot for visual confirmation
        await page.screenshot(path='screenshot.png')

        await browser.close()

asyncio.run(main())

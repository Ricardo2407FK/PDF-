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
        await page.wait_for_selector('#welcome-screen:not(.hidden)')

        # Set up the file input listener robustly BEFORE clicking the button
        async with page.expect_file_chooser() as fc_info:
            await page.click('#welcome-upload-btn')
        file_chooser = await fc_info.value
        await file_chooser.set_files('test.pdf')

        # Wait for the welcome screen to be hidden and the editor to be visible
        await page.wait_for_selector('#welcome-screen', state='hidden')
        await page.wait_for_selector('#content-area:not(.hidden)')
        await page.wait_for_selector('.thumbnail-item[data-page-number="3"]') # Wait for all thumbnails

        # Reorder pages by simulating drag
        source_thumb = await page.query_selector('.thumbnail-item[data-page-number="1"]')
        target_thumb = await page.query_selector('.thumbnail-item[data-page-number="3"]')
        source_box = await source_thumb.bounding_box()
        target_box = await target_thumb.bounding_box()
        await page.mouse.move(source_box['x'] + source_box['width'] / 2, source_box['y'] + source_box['height'] / 2)
        await page.mouse.down()
        await page.mouse.move(target_box['x'] + target_box['width'] / 2, target_box['y'] + target_box['height'] / 2)
        await page.mouse.up()

        # IMPORTANT: Wait for the re-render to complete after reordering
        await page.wait_for_selector('.page-container[data-page-number="1"]')

        # Add text to the first page
        await page.click('#add-text-btn')
        await page.fill('#text-input', 'This is a final test')
        await page.click('.text-overlay[data-page-number="1"]')
        await page.wait_for_selector('div[contenteditable="true"]')

        # Add a rectangle to the second page
        await page.click('#add-rect-btn')
        await page.click('.text-overlay[data-page-number="2"]')
        await page.wait_for_selector('.shape-container')

        # Move the text element
        text_element = await page.query_selector('div[contenteditable="true"]')
        text_box = await text_element.bounding_box()
        await page.mouse.move(text_box['x'] + text_box['width'] / 2, text_box['y'] + text_box['height'] / 2)
        await page.mouse.down()
        await page.mouse.move(text_box['x'] + 150, text_box['y'] + 50)
        await page.mouse.up()

        # Start waiting for download before clicking the button
        async with page.expect_download() as download_info:
            await page.click('#download-btn')
        download = await download_info.value
        await download.path()

        # Take a screenshot for visual confirmation
        await page.screenshot(path='screenshot.png')

        await browser.close()

asyncio.run(main())

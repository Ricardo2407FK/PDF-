from PIL import Image

# Create a new image with a red background
img = Image.new('RGB', (100, 100), color = 'red')
img.save('test.png', 'PNG')

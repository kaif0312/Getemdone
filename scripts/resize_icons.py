#!/usr/bin/env python3
"""
Resize logo image to required PWA icon sizes
"""
import os
from PIL import Image

# Paths
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
public_dir = os.path.join(project_root, 'public')

# Source logo
logo_path = os.path.join(public_dir, 'logoimage.png')

# Check if logo exists
if not os.path.exists(logo_path):
    print(f"❌ Error: Logo not found at {logo_path}")
    exit(1)

print(f"📷 Opening logo: {logo_path}")

try:
    # Open the logo
    logo = Image.open(logo_path)
    print(f"✅ Original size: {logo.size[0]}x{logo.size[1]}")
    
    # Convert to RGBA if needed (for transparency support)
    if logo.mode != 'RGBA':
        logo = logo.convert('RGBA')
    
    # Required sizes for PWA
    sizes = [
        (192, 192, 'icon-192.png'),
        (512, 512, 'icon-512.png'),
    ]
    
    for width, height, filename in sizes:
        # Resize with high-quality antialiasing
        resized = logo.resize((width, height), Image.Resampling.LANCZOS)
        
        # Save the resized image
        output_path = os.path.join(public_dir, filename)
        resized.save(output_path, 'PNG', optimize=True)
        
        print(f"✅ Created: {filename} ({width}x{height})")
    
    print("\n🎉 All icons generated successfully!")
    print("\nNext steps:")
    print("1. Check public/icon-192.png and public/icon-512.png")
    print("2. Run: npm run dev")
    print("3. Test the app at http://localhost:3000")
    
except Exception as e:
    print(f"❌ Error: {e}")
    print("\nTroubleshooting:")
    print("- Make sure PIL/Pillow is installed: pip install Pillow")
    print("- Check that logoimage.png is a valid image file")
    exit(1)

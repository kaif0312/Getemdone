#!/bin/bash

# Script to easily switch between Firebase Emulator and Production

ENV_FILE=".env.local"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: .env.local file not found!"
    exit 1
fi

if [ "$1" == "emulator" ] || [ "$1" == "em" ]; then
    # Switch to emulator
    sed -i 's/NEXT_PUBLIC_USE_EMULATOR=false/NEXT_PUBLIC_USE_EMULATOR=true/' "$ENV_FILE"
    echo "✅ Switched to Firebase Emulator mode"
    echo "📝 Run 'firebase emulators:start' in another terminal"
    echo "💡 Reads/writes are FREE in emulator mode!"
elif [ "$1" == "production" ] || [ "$1" == "prod" ]; then
    # Switch to production
    sed -i 's/NEXT_PUBLIC_USE_EMULATOR=true/NEXT_PUBLIC_USE_EMULATOR=false/' "$ENV_FILE"
    echo "✅ Switched to Production Firebase mode"
    echo "⚠️  Reads/writes will count toward your quota"
elif [ "$1" == "status" ] || [ "$1" == "" ]; then
    # Show current status
    if grep -q "NEXT_PUBLIC_USE_EMULATOR=true" "$ENV_FILE"; then
        echo "🔧 Current mode: EMULATOR (FREE - no quota usage)"
    else
        echo "🌐 Current mode: PRODUCTION (uses quota)"
    fi
else
    echo "Usage: ./scripts/switch-emulator.sh [emulator|production|status]"
    echo ""
    echo "Commands:"
    echo "  emulator, em  - Switch to emulator mode (FREE)"
    echo "  production, prod - Switch to production mode"
    echo "  status       - Show current mode (default)"
    exit 1
fi

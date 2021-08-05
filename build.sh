lsb_release -a
# Check which ubuntu version is being used
rsync --version
brew install rsync
# Crude Fix
rsync -a --mkpath ./src ./site
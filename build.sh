lsb_release -a
# Check which ubuntu version is being used
rsync --version
brew install rsync
# Crude Fix for rsync version
. ~/.bashrc
# To refresh bash session
rsync -a --mkpath ./src ./site
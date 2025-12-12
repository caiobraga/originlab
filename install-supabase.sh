#!/bin/bash
cd /home/caio/development/sites/originlab
source ~/.nvm/nvm.sh
nvm use 20
npm install @supabase/supabase-js --legacy-peer-deps
echo "Installation complete!"


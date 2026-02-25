@echo off
if not exist Backend mkdir Backend
if not exist Frontend mkdir Frontend
move src Backend\
move services Backend\
move .env Backend\
move credentials.json Backend\
move package.json Backend\
move package-lock.json Backend\
move public\* Frontend\
rmdir public

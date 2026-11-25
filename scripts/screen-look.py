# One look: an interactive claude in a pty, no prompt sent; read the screen, /exit.
import os,pty,sys,time,select,signal,re
kit,mod,binary,logp=sys.argv[1:5]
env={k:v for k,v in os.environ.items() if k not in ('CLAUDE_CODE_CHILD_SESSION','CLAUDE_CODE_PLUGIN_DIRS')}
env.update(COLUMNS='150',LINES='45',TERM='xterm-256color',CLAUDE_CODE_PLUGIN_DIRS=mod)
out=open(logp,'wb',buffering=0)
pid,fd=pty.fork()
if pid==0:
    os.chdir(kit)
    os.execve(binary,['claude','--setting-sources','project,local'],env)
def pump(sec):
    end=time.time()+sec
    while time.time()<end:
        r,_,_=select.select([fd],[],[],0.3)
        if r:
            try: out.write(os.read(fd,65536))
            except OSError: return False
    return True
pump(25)
os.write(fd,b'/exit'); pump(1); os.write(fd,b'\r'); pump(4)
try: os.kill(pid,signal.SIGTERM); time.sleep(1); os.kill(pid,signal.SIGKILL)
except ProcessLookupError: pass

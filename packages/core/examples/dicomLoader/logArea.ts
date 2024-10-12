export type AddLogFn = (message: string, ...args: unknown[]) => void;

function createLogArea() {
  const area = document.createElement('div');
  area.id = 'log-area';
  area.style.width = '500px';
  area.style.height = '1000px';
  area.style.background = 'lightblue';
  area.style.margin = '5px';
  area.style.padding = '5px';
  area.style.float = 'right';

  const addLog = (message: string, ...args: unknown[]) => {
    console.log(message, ...args);
    const p = document.createElement('p');
    p.appendChild(document.createTextNode(message));
    area.appendChild(p);
    for (let i = 0; i < args.length; ++i) {
      let arg = args[i] as any;
      try {
        arg = arg.error || arg.message || arg.exception || arg;
        arg = arg.error || arg.message || arg.exception || arg;
      } catch (err) {
        /* ignore */
      }

      if (arg && arg.toString) {
        arg = arg.toString();
      }
      if (typeof arg != 'string') {
        try {
          arg = JSON.stringify(arg, null, 0);
        } catch (err) {
          arg = String(arg);
        }
      }

      if (arg.startsWith('[object')) {
        arg += ' (see console for dump)';
      }

      const p = document.createElement('p');
      p.style.margin = '';
      p.style.marginLeft = '20px';
      p.appendChild(document.createTextNode(arg));
      area.appendChild(p);
    }
  };

  addLog('Ready to rumble.');

  return {
    area,
    addLog,
  };
}

export default createLogArea;

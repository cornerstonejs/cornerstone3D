export type AddLogFn = (message: string, ...args: unknown[]) => void;

function createLogArea() {
  const area = document.createElement('div');
  area.id = 'log-area';
  area.style.width = '500px';
  area.style.height = '80vh';
  area.style.background = 'lightblue';
  area.style.margin = '5px';
  area.style.padding = '5px';
  area.style.float = 'right';
  area.style.overflow = 'scroll';

  let lastMessage = '';
  let lastElement: HTMLDivElement | undefined;

  const addLog = (message: string, ...args: unknown[]) => {
    console.log(message, ...args);

    const argOffset = '20px';

    if (message != lastMessage) {
      lastElement = document.createElement('div');
      lastElement.style.margin = '';
      if (lastMessage != '') {
        lastElement.style.borderTop = '1px dashed gray';
      }
      area.appendChild(lastElement);

      lastMessage = message;

      const p = document.createElement('p');
      p.style.margin = '0';
      p.appendChild(document.createTextNode(message));
      area.appendChild(p);
    } else if (lastMessage != '') {
      const hr = document.createElement('hr');
      hr.style.margin = '0';
      hr.style.marginLeft = argOffset;
      hr.style.border = '0';
      hr.style.borderTop = '1px dashed gray';
      area.appendChild(hr);
    }

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
      p.style.margin = '0';
      p.style.marginLeft = argOffset;
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

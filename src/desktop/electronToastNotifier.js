export class ElectronToastNotifier {
  #Notification;
  #events = [];

  constructor({ Notification }) {
    this.#Notification = Notification;
  }

  #push(level, message) {
    this.#events.push({ level, message });

    if (!this.#Notification?.isSupported?.()) {
      return;
    }

    const titleByLevel = {
      info: "FeatherTalk",
      warning: "FeatherTalk Warning",
      error: "FeatherTalk Error"
    };

    const notification = new this.#Notification({
      title: titleByLevel[level] ?? "FeatherTalk",
      body: message
    });

    notification.show();
  }

  info(message) {
    this.#push("info", message);
  }

  warning(message) {
    this.#push("warning", message);
  }

  error(message) {
    this.#push("error", message);
  }

  get events() {
    return [...this.#events];
  }
}

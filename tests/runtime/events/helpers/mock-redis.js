export class MockRedis {
  constructor() {
    this.connected = false;
    this.sequence = 0;
    this.streams = new Map(); // stream -> [{ id, fields }]
    this.groups = new Map(); // stream -> group -> { cursor, pending: Map }
  }

  async connect() {
    this.connected = true;
  }

  disconnect() {
    this.connected = false;
  }

  async quit() {
    this.connected = false;
    return 'OK';
  }

  on() {
    // no-op for tests
  }

  once() {
    // no-op for tests
  }

  removeListener() {
    // no-op for tests
  }

  async xadd(stream, ...args) {
    let index = 0;
    let maxLen = null;
    if (args[index] === 'MAXLEN') {
      index += 1; // skip MAXLEN
      if (args[index] === '~') {
        index += 1;
      }
      maxLen = Number(args[index]);
      index += 1;
    }

    const idArg = args[index];
    index += 1;
    const fields = args.slice(index);

    if (fields.length % 2 !== 0) {
      throw new Error('Fields must be key/value pairs');
    }

    const id = idArg === '*' ? this.#generateId() : idArg;
    const entries = this.streams.get(stream) ?? [];
    entries.push({ id, fields: [...fields] });

    if (maxLen && Number.isInteger(maxLen) && maxLen > 0 && entries.length > maxLen) {
      entries.splice(0, entries.length - maxLen);
    }

    this.streams.set(stream, entries);
    return id;
  }

  async xgroup(action, stream, group, startId, mkStream) {
    const command = typeof action === 'string' ? action.toUpperCase() : '';
    if (command !== 'CREATE') {
      throw new Error(`Unsupported XGROUP action for mock: ${action}`);
    }

    if (!this.streams.has(stream)) {
      if (String(mkStream).toUpperCase() !== 'MKSTREAM') {
        throw new Error(`Stream ${stream} does not exist`);
      }
      this.streams.set(stream, []);
    }

    const streamGroups = this.groups.get(stream) ?? new Map();
    if (streamGroups.has(group)) {
      const error = new Error('BUSYGROUP Consumer Group name already exists');
      error.name = 'ReplyError';
      throw error;
    }

    streamGroups.set(group, {
      cursor: -1,
      pending: new Map()
    });
    this.groups.set(stream, streamGroups);
    return 'OK';
  }

  async call(command, ...args) {
    const cmd = String(command).toUpperCase();
    if (cmd === 'XGROUP') {
      return this.xgroup(...args);
    }
    throw new Error(`Unsupported command in mock: ${command}`);
  }

  async xreadgroup(...args) {
    const params = this.#parseReadGroupArgs(args);
    const streamEntries = this.streams.get(params.stream) ?? [];
    const groupData = this.#getGroup(params.stream, params.group);

    const results = [];
    let delivered = 0;
    for (let i = groupData.cursor + 1; i < streamEntries.length && delivered < params.count; i += 1) {
      const entry = streamEntries[i];
      groupData.cursor = i;
      groupData.pending.set(entry.id, {
        entry,
        consumer: params.consumer
      });
      results.push([entry.id, [...entry.fields]]);
      delivered += 1;
    }

    if (results.length === 0) {
      return null;
    }

    return [[params.stream, results]];
  }

  async xack(stream, group, id) {
    const groupData = this.#getGroup(stream, group, false);
    if (!groupData) {
      return 0;
    }

    if (groupData.pending.has(id)) {
      groupData.pending.delete(id);
      return 1;
    }
    return 0;
  }

  #parseReadGroupArgs(args) {
    if (args[0] !== 'GROUP') {
      throw new Error('GROUP keyword expected');
    }
    const group = args[1];
    const consumer = args[2];
    let index = 3;
    let count = 1;
    let stream = null;
    let startId = '>';

    while (index < args.length) {
      const token = args[index];
      switch (token) {
        case 'COUNT':
          count = Number(args[index + 1]);
          index += 2;
          break;
        case 'BLOCK':
          // ignore block for mock
          index += 2;
          break;
        case 'IDLE':
          index += 2;
          break;
        case 'STREAMS':
          stream = args[index + 1];
          startId = args[index + 2];
          index = args.length; // exit loop
          break;
        default:
          index += 1;
          break;
      }
    }

    if (!stream) {
      throw new Error('STREAMS argument required');
    }

    if (startId !== '>') {
      throw new Error('MockRedis only supports ">" startId');
    }

    return { group, consumer, count: Math.max(1, count), stream };
  }

  #getGroup(stream, group, createIfMissing = true) {
    let streamGroups = this.groups.get(stream);
    if (!streamGroups) {
      if (!createIfMissing) {
        return null;
      }
      streamGroups = new Map();
      this.groups.set(stream, streamGroups);
    }

    let groupData = streamGroups.get(group);
    if (!groupData) {
      if (!createIfMissing) {
        return null;
      }
      groupData = {
        cursor: -1,
        pending: new Map()
      };
      streamGroups.set(group, groupData);
    }
    return groupData;
  }

  #generateId() {
    this.sequence += 1;
    const timestamp = Date.now();
    return `${timestamp}-${this.sequence}`;
  }
}

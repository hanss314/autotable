/* eslint no-console: 0 */

import WebSocket from 'ws';
import { Client, Game, randomString } from './game';
import { Message } from './protocol';

type WebSocketClient = WebSocket & Client;

export class Server {
  port: number;
  games: Map<string, Game> = new Map();

  constructor(port: number) {
    this.port = port;
  }

  run(): void {
    const wss = new WebSocket.Server({
      port: this.port,
    });

    wss.on("connection", ws => {
      const client = ws as WebSocketClient;
      client.game = null;
      client.playerId = null;

      client.on('message', data => {
        if (client.game !== null) {
          console.log(`recv ${client.game.gameId}.${client.playerId} ${data}`);
        } else {
          console.log(`recv * ${data}`);
        }

        const message = JSON.parse(data as string) as Message;

        try {
          this.onMessage(client, message);
        } catch(err) {
          console.error(err);
          client.close();
          this.onClose(client);
        }
      });

      client.on('close', () => {
        console.log('> disconnect');
        this.onClose(client);
      });
    });

    setInterval(this.checkExpiry.bind(this), 5000);

    console.log(`listening at ${this.port}`);
  }

  onMessage(client: Client, message: Message): void {
    if (client.game) {
      client.game.onMessage(client, message);
      return;
    }

    switch(message.type) {
      case 'NEW': {
        let gameId: string;
        do {
          gameId = randomString();
        } while (this.games.has(gameId));

        const game = new Game(gameId);
        this.games.set(gameId, game);
        game.join(client);
        break;
      }

      case 'JOIN': {
        const game = this.games.get(message.gameId);
        if (!game) {
          throw `game not found: ${message.gameId}`;
        }
        game.join(client);
        break;
      }
      default:
        throw `unknown message: ${message.type}`;
    }
  }

  onClose(client: Client): void {
    if (client.game !== null) {
      client.game.leave(client);
    }
  }

  checkExpiry(): void {
    const now = new Date().getTime();
    for (const [gameId, game] of this.games.entries()) {
      if (game.expiryTime !== null && game.expiryTime < now) {
        console.log(`deleting expired: ${gameId}`);
        this.games.delete(gameId);
      }
    }
  }
}

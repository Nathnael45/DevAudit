import 'dotenv/config';
import http from 'http';
import app from './app';
import { setupWebSocket } from './ws/hub';

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`DevAudit API running on port ${PORT}`);
});

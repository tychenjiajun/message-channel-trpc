const config = {
  compilationOptions: {
    preferredConfigPath: './tsconfig.json',
  },
  entries: [
    {
      filePath: './src/client/index.ts',
      outFile: `./dist/client.d.ts`,
      noCheck: true,
    },
    {
      filePath: './src/server/index.ts',
      outFile: `./dist/server.d.ts`,
      noCheck: true
    },
  ],
};

module.exports = config;

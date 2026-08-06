import fs from 'fs';

const files = [
  "server/__tests__/aqea/benchmarks.test.ts",
  "server/__tests__/aqea/cnnPredictor.test.ts",
  "server/__tests__/aqea/cnnVoting.test.ts",
  "server/__tests__/aqea/engine.integration.test.ts",
  "server/__tests__/aqea/exitEngine.test.ts",
  "server/__tests__/aqea/multiTimeframeEngine.test.ts",
  "server/__tests__/aqea/orderFlowVoting.test.ts",
  "server/__tests__/aqea/ppoAuthority.test.ts",
  "server/__tests__/aqea/regimeEngine.test.ts",
  "server/__tests__/aqea/smartMoneyVoting.test.ts"
];

const mockBlock = `import { jest } from '@jest/globals';

const chainMock = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([])
};

jest.unstable_mockModule("mongoose", () => {
  class MockSchema {
    static Types = { ObjectId: "ObjectId" };
    index() {}
  }
  return {
    default: {
      connection: { readyState: 1 },
      Types: { ObjectId: class { id: any; constructor(id: any) { this.id = id; } toString() { return this.id; } static isValid() { return true; } } },
      model: jest.fn().mockReturnValue({ index: jest.fn() }),
      Schema: MockSchema
    },
    Schema: MockSchema,
    model: jest.fn().mockReturnValue({ index: jest.fn() })
  };
});

jest.unstable_mockModule("../../src/models/Trade.js", () => ({
  Trade: { find: jest.fn().mockReturnValue(chainMock) }
}));

jest.unstable_mockModule("../../src/models/AqeaTradeAnalytics.js", () => ({
  AqeaTradeAnalytics: { find: jest.fn().mockReturnValue(chainMock), create: jest.fn().mockResolvedValue({}) }
}));
`;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  
  // We need to replace everything from the start of the file up to the next `jest.unstable_mockModule` that isn't mongoose or Trade.js.
  // Or up to `const ` if there are no other mocks.
  
  // Let's use a regex to match the top part of the file
  const regex = /^import \{ jest \} from '@jest\/globals';[\s\S]*?(?=jest\.unstable_mockModule\("|const )/;
  
  content = content.replace(regex, mockBlock + '\n');
  
  fs.writeFileSync(file, content);
}

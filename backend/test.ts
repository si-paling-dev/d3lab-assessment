import dotenv from 'dotenv';
import { ethers } from 'ethers';
import axios from 'axios';
import readline from 'readline';
import { getBlockNumberByTimestamp, getOwnersOnBlockNumber, processAddressBatch, getETHValueAtEpoch, main } from 'index'; // Adjust the import path

dotenv.config();

jest.mock('axios');
jest.mock('ethers');
jest.mock('readline');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedEthers = ethers as jest.Mocked<typeof ethers>;
const mockedReadline = readline as jest.Mocked<typeof readline>;

describe('Environment Variables Check', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('should throw error if API keys are missing', () => {
    delete process.env.ALCHEMY_API_KEY;
    delete process.env.ETHERSCAN_API_KEY;
    expect(() => require('./your-script-file')).toThrowError('Please check your .env file');
  });
});

describe('getBlockNumberByTimestamp', () => {
  it('should return block number for valid timestamp', async () => {
    const mockBlock = '123456';
    mockedAxios.get.mockResolvedValueOnce({
      data: { status: '1', result: mockBlock }
    });
    const result = await getBlockNumberByTimestamp(1630000000);
    expect(result).toBe(mockBlock);
  });

  it('should throw error on API failure', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { status: '0', result: 'Error' }
    });
    await expect(getBlockNumberByTimestamp(1630000000)).rejects.toThrow();
  });
});

describe('getOwnersOnBlockNumber', () => {
  it('should return owner addresses', async () => {
    const mockOwners = ['0x123', '0x456'];
    mockedAxios.get.mockResolvedValueOnce({
      data: { ownerAddresses: mockOwners }
    });
    const owners = await getOwnersOnBlockNumber('123456');
    expect(owners).toEqual(mockOwners);
  });
});

describe('processAddressBatch', () => {
  const mockProvider = {
    getBalance: jest.fn()
  };
  mockedEthers.JsonRpcProvider.mockReturnValue(mockProvider as any);

  it('should process addresses and return balances', async () => {
    const addresses = ['0x1', '0x2'];
    const balances = ['1.0', '2.0'];
    mockProvider.getBalance
      .mockResolvedValueOnce(ethers.parseUnits(balances[0], 'ether'))
      .mockResolvedValueOnce(ethers.parseUnits(balances[1], 'ether'));

    const results = await processAddressBatch(addresses, '123456');
    expect(results).toEqual([
      { address: '0x1', balance: '1.0' },
      { address: '0x2', balance: '2.0' }
    ]);
  });

  it('should handle errors gracefully', async () => {
    const addresses = ['0x1'];
    mockProvider.getBalance.mockRejectedValueOnce(new Error('RPC Error'));
    const results = await processAddressBatch(addresses, '123456');
    expect(results[0].error).toMatch('RPC Error');
  });
});

describe('getETHValueAtEpoch', () => {
    const mockProvider = {
        getBalance: jest.fn()
        };
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
    mockedAxios.get.mockResolvedValueOnce({ data: { result: '123456' } }); // getBlockNumberByTimestamp
    mockedAxios.get.mockResolvedValueOnce({ data: { ownerAddresses: ['0x1', '0x2'] } }); // getOwnersOnBlockNumber
    mockProvider.getBalance.mockResolvedValue(ethers.parseUnits('1.5', 'ether')); // processAddressBatch
  });

  it('should calculate total ETH correctly', async () => {
    const result = await getETHValueAtEpoch(1630000000);
    expect(result.totalETH).toBe(3); // 1.5 * 2 addresses
  });
});

describe('Main Function', () => {
  const mockUserInput = (input: string) => {
    mockedReadline.createInterface.mockReturnValueOnce({
      question: (query: string, cb: (answer: string) => void) => cb(input),
      close: () => null
    } as any);
  };

  it('should handle valid epoch input', async () => {
    mockUserInput('1630000000');
    jest.spyOn(console, 'log').mockImplementation();
    await main();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Calculating ETH values'));
  });

  it('should reprompt on invalid input', async () => {
    const mockInterface = {
      question: jest.fn()
        .mockImplementationOnce((_, cb) => cb('invalid'))
        .mockImplementationOnce((_, cb) => cb('1630000000')),
      close: jest.fn()
    };
    mockedReadline.createInterface.mockReturnValueOnce(mockInterface as any);
    await main();
    expect(mockInterface.question).toHaveBeenCalledTimes(2);
  });
});
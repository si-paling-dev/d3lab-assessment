import dotenv from "dotenv"
import { ethers } from "ethers";
import axios from "axios";
import readline from 'readline';

dotenv.config()

let ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY; // this will result null
let ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY; // this will result null
const BAYC_CONTRACT = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";
const BATCH_SIZE = 200; // Number of addresses to process in each batch

console.log(ALCHEMY_API_KEY)

if (!process.env.ALCHEMY_API_KEY || !process.env.ETHERSCAN_API_KEY) {
    throw new Error('Please check your .env file and ensure all required variables are set');
}

interface OwnersByBlock {
    ownerAddresses: string[]
}

interface BalanceResult {
    address: string;
    balance: string;
    error?: string;
}


// Function to get the block number closest to a given epoch time
export async function getBlockNumberByTimestamp(epochTime: number): Promise<string> {
    const url = `https://api.etherscan.io/api?module=block&action=getblocknobytime&timestamp=${epochTime}&closest=before&apikey=${ETHERSCAN_API_KEY}`;
    const response = await axios.get(url);
    if (response.data.status !== "1") {
        throw new Error(`Failed to fetch block number by timestamp: ${response.data.result}`);
    }
    return response.data.result;
}


// Function to get owners at the given block
export async function getOwnersOnBlockNumber(blockNumber: string) {
    const url = `https://eth-mainnet.g.alchemy.com/nft/v2/${ALCHEMY_API_KEY}/getOwnersForCollection/?contractAddress=${BAYC_CONTRACT}&block=${blockNumber}`;
    const response = await axios.get<OwnersByBlock>(url);
    return response.data.ownerAddresses;
}


// Function to process a batch of addresses
export async function processAddressBatch(
    addresses: string[],
    blockNumber: string
): Promise<BalanceResult[]> {
    const provider = new ethers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`);
    try {
        // Create multicall-style batch request
        const balancePromises = addresses.map(address => 
            provider.getBalance(address, parseInt(blockNumber))
                .then(balance => ({
                    address,
                    balance: ethers.formatEther(balance)
                }))
                .catch(error => ({
                    address,
                    balance: "0",
                    error: error.message
                }))
        );
        return await Promise.all(balancePromises);
    } catch (error) {
        console.error("Error processing batch:", error);
        throw error;
    }
}


// function to calculate all ETH value on addresses on specific time
export async function getETHValueAtEpoch(epochTime:number) {
    try {

        let totalETH = 0;
        const results: BalanceResult[] = [];

        let blockNumber = await getBlockNumberByTimestamp(epochTime);
        console.log(`Target block: ${blockNumber}`);
        
        // Around 5000 address for the results
        let ownersList = await getOwnersOnBlockNumber(blockNumber);
        console.log(`Unique historical owners: ${ownersList.length}`);

        // Process addresses in batches
        for (let i = 0; i < ownersList.length; i += BATCH_SIZE) {
            const batchAddresses = ownersList.slice(i, i + BATCH_SIZE) as string[];
            console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(ownersList.length / BATCH_SIZE)}`);
            
            const batchResults = await processAddressBatch(batchAddresses, blockNumber);
            results.push(...batchResults);
            
            // Update running total
            const batchTotal = batchResults.reduce((sum, result) => sum + parseFloat(result.balance), 0);
            totalETH += batchTotal;

            // Add delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < ownersList.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Calculate statistics
        const averageETH = totalETH / ownersList.length;
        const timestamp = new Date(epochTime * 1000).toISOString();

        // Print results
        console.log("\nResults Summary:");
        console.log(`Timestamp: ${timestamp}`);
        console.log(`Block Number: ${blockNumber}`);
        console.log(`Total Addresses Processed: ${ownersList.length}`);
        console.log(`Total ETH: ${totalETH.toFixed(4)} ETH`);
        console.log(`Average ETH per Address: ${averageETH.toFixed(4)} ETH`);
        console.log(`\n`);


        // Return comprehensive results
        return {
            timestamp,
            blockNumber,
            totalAddresses: ownersList.length,
            totalETH,
            averageETH,
            details: results
        };

    } catch (error) {
        console.error("Error in getETHValueAtEpoch:", error);
        throw error;
    }


}


// Function to validate epoch time
function isValidEpochTime(epochTime: number): boolean {
    return !isNaN(epochTime) && epochTime > 0;
}


// Function to get user input
function getUserInput(prompt: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}


export async function main() {
    try {

        console.log("ETH Value Calculator for BAYC Holders at epoch");
        console.log("====================================");
        
        let epochTime: number;
        let isValid = false;

        do {
            const input = await getUserInput("Enter epoch time: ");
            epochTime = parseInt(input);
            isValid = isValidEpochTime(epochTime);
            if (!isValid) {
                console.log("Invalid epoch time. Please enter a valid positive number.");
            }
        } while (!isValid);

        console.log(`\nCalculating ETH values for epoch time ${epochTime}...`);
        const result = await getETHValueAtEpoch(epochTime);
        return result.totalETH;

    } catch (error) {
        console.error("Error in main:", error);
    }
}

main();
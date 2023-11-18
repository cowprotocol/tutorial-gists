import { TypedDataDomain, ethers } from "ethers";
import { hashOrder, domain, OrderKind, OrderBalance, Order } from "@cowprotocol/contracts"
import { BuyTokenDestination, COW_PROTOCOL_SETTLEMENT_CONTRACT_ADDRESS, OrderBookApi, SellTokenSource, SigningScheme, SupportedChainId } from "@cowprotocol/cow-sdk";

require('dotenv').config()

if (!process.env['PRIVATE_KEY']) {
    throw new Error("PRIVATE_KEY is not set")
}

if (!process.env['RPC_URL']) {
    throw new Error("RPC_URL is not set")
}

const BUY_TOKEN = "0x0000000000000000000000000000000000000000";
const SELL_TOKEN = "0x0000000000000000000000000000000000000000";
const RECEIVER = "0x075E706842751c28aAFCc326c8E7a26777fe3Cc2";
const SAFE = "0x075E706842751c28aAFCc326c8E7a26777fe3Cc2";

// EIP-712 domains
const cowEip712Domain = domain(100, COW_PROTOCOL_SETTLEMENT_CONTRACT_ADDRESS[100]!)
const safeEip712Domain: TypedDataDomain = {
    chainId: 100,
    verifyingContract: SAFE
}

const provider = new ethers.providers.JsonRpcProvider(process.env['RPC_URL']!)
const signer = new ethers.Wallet(process.env['PRIVATE_KEY']!, provider)

async function main() {
    // 1. define the order
    const order: Order = {
        buyAmount: ethers.utils.parseEther("1"),
        sellAmount: ethers.utils.parseEther("1"),
        buyToken: BUY_TOKEN,
        sellToken: SELL_TOKEN,
        validTo: Math.floor(Date.now() / 1000) + 3600,
        appData: "0x0000000000000000000000000000000000000000000000000000000000000000",
        feeAmount: "0",
        kind: OrderKind.SELL,
        partiallyFillable: false,
        buyTokenBalance: OrderBalance.ERC20,
        sellTokenBalance: OrderBalance.ERC20,
        receiver: RECEIVER
    }

    // 2. EIP712 hash of the order
    const orderHash = hashOrder(cowEip712Domain, order);
    const message = ethers.utils.defaultAbiCoder.encode(["bytes32"], [orderHash]);

    // 3. define a SafeMessage whose content is (2)
    const safeMessageType = {
        SafeMessage: [
            { name: "message", type: "bytes" }
        ]
    };

    const safeMessage = {
        message
    };

    // 4. sign the eip712 typed data with the private key of the Safe owner
    const signature = await signer._signTypedData(safeEip712Domain, safeMessageType, safeMessage);

    // Now that we have the signature, let's verify that this is valid against the safe
    // using ERC-1271!
    const safeContract = new ethers.Contract(SAFE, [
        "function isValidSignature(bytes32 _hash, bytes _signature) external view returns (bytes4 magicValue)"
    ], provider);

    const isValidSignature = await safeContract['isValidSignature'](orderHash, signature);

    if (isValidSignature !== "0x1626ba7e") {
        throw new Error("Invalid signature")
    } else {
        console.log("Signature is valid!")
        console.log("Signature: ", signature)
    }

    // now that we have a valid signature, let's send it to the order book!
    const orderBookApi = new OrderBookApi({ chainId: SupportedChainId.GNOSIS_CHAIN });

    // FYI - the below is needed as the mappings between the types is a bit wonky.
    // This is a known area needed for improvement, please file PRs on the cow-sdk
    // repository if you wish to address this!!
    const orderUid = await orderBookApi.sendOrder({
        ...order,
        sellAmount: order.sellAmount.toString(),
        buyAmount: order.buyAmount.toString(),
        feeAmount: order.feeAmount.toString(),
        validTo: Number(order.validTo.toString()),
        appData: order.appData.toString(),
        buyTokenBalance: BuyTokenDestination.ERC20,
        sellTokenBalance: SellTokenSource.ERC20,
        from: SAFE,
        signingScheme: SigningScheme.EIP1271,
        signature
    })

    console.log(`OrderUid ${orderUid} submitted!`)
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
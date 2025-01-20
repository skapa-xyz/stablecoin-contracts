const { FilecoinClient } = require("@blitslabs/filecoin-js-signer");
const { CoinType, bigintToArray, delegatedFromEthAddress } = require("@glif/filecoin-address");
const BigNumber = require("bignumber.js");
const { HttpJsonRpcConnector, LotusClient } = require("filecoin.js");
const { createProposeMessage } = require("filecoin.js/builds/dist/utils/msig");

const METHOD_TYPES = {
  INVOKE_EVM: 3844450837,
};
const PRIVATE_CONSTRUCTOR_SYMBOL = Symbol("private");

class MultisigProposal {
  #filecoinClient;
  #signer;
  #privateKey;
  #multisigWallet;
  #lotusClient;
  #transactions = [];
  #coinType;

  constructor(symbol) {
    // Prevents outside initialization to ensure the class is always initialized via the static create method
    if (symbol !== PRIVATE_CONSTRUCTOR_SYMBOL) {
      throw new Error("Not allowed to initialize from outside");
    }
  }

  static async create(
    signerF1Addr,
    signerPrivateKey,
    multisigWalletF2Addr,
    rpcEndpoint,
    isTestnet,
  ) {
    const proposal = new MultisigProposal(PRIVATE_CONSTRUCTOR_SYMBOL);
    await proposal.#init(
      signerF1Addr,
      signerPrivateKey,
      multisigWalletF2Addr,
      rpcEndpoint,
      isTestnet,
    );

    return proposal;
  }

  async #init(signerF1Addr, signerPrivateKey, multisigWalletF2Addr, rpcEndpoint, isTestnet) {
    if (!signerPrivateKey) {
      throw Error("signerPrivateKey is not set");
    }

    if (!rpcEndpoint) {
      throw Error("rpcEndpoint is not set");
    }

    this.#signer = signerF1Addr;
    this.#privateKey = signerPrivateKey;
    this.#multisigWallet = multisigWalletF2Addr;
    this.#filecoinClient = new FilecoinClient(rpcEndpoint);
    this.#lotusClient = new LotusClient(new HttpJsonRpcConnector({ url: rpcEndpoint }));
    this.#coinType = isTestnet ? CoinType.TEST : CoinType.MAIN;
  }

  async add(to, data) {
    this.#transactions.push({
      to,
      data,
    });
  }

  async submit() {
    if (this.#transactions.length === 0) {
      console.warn("Skipped proposal submission due to no update");
      return;
    }

    const addressList = [];

    for (const transaction of this.#transactions) {
      const f410Address = delegatedFromEthAddress(transaction.to, this.#coinType);
      const lookupId = await this.#lotusClient.state.lookupId(f410Address);

      addressList.push({
        "ETH Address": transaction.to,
        "F410 Address": f410Address,
        "Lookup ID": lookupId,
      });

      const message = await createProposeMessage(
        this.#multisigWallet,
        this.#signer,
        lookupId,
        "0",
        METHOD_TYPES.INVOKE_EVM,
        bigintToArray(transaction.data),
      );

      const response = await this.#filecoinClient.tx.sendMessage(
        {
          To: message.To,
          From: message.From,
          Value: message.Value ?? new BigNumber(0),
          GasLimit: message.GasLimit ?? 0,
          GasFeeCap: message.GasFeeCap ?? new BigNumber(0),
          GasPremium: message.GasPremium ?? new BigNumber(0),
          Method: message.Method ?? 0,
          Params: message.Params ?? "",
          Version: message.Version ?? 0,
          Nonce: message.Nonce ?? 0,
        },
        this.#privateKey,
      );

      console.log(`Submitted proposals at ${response["/"]}`);
    }

    console.table(addressList);
  }
}

module.exports = { MultisigProposal };

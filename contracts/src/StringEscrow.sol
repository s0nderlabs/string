// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title StringEscrow — Fixed-price escrow for String protocol jobs
/// @notice Agents sign EIP-712 typed data, backend relays. Funding via EIP-3009.
contract StringEscrow is EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Types ──

    enum JobStatus {
        Funded,     // 0 — escrow funded, provider working
        Done,       // 1 — provider marked done, 24h timer started
        Disputed,   // 2 — buyer disputed during Done phase
        Settled     // 3 — terminal: funds released
    }

    struct Job {
        address buyer;
        address provider;
        uint256 amount;
        bytes32 descriptionHash;
        JobStatus status;
        uint256 createdAt;
        uint256 doneAt;
    }

    // ── EIP-712 Type Hashes ──

    bytes32 public constant CREATE_JOB_TYPEHASH =
        keccak256("CreateJob(address buyer,address provider,uint256 amount,bytes32 descriptionHash,bytes32 nonce)");

    bytes32 public constant MARK_DONE_TYPEHASH =
        keccak256("MarkDone(uint256 jobId)");

    bytes32 public constant ACCEPT_RESULT_TYPEHASH =
        keccak256("AcceptResult(uint256 jobId)");

    bytes32 public constant DISPUTE_TYPEHASH =
        keccak256("Dispute(uint256 jobId)");

    // ── Constants ──

    uint256 public constant PROTOCOL_FEE_BPS = 500; // 5%
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant ACCEPTANCE_PERIOD = 24 hours;
    uint256 public constant MAX_JOB_LIFETIME = 7 days;

    // ── Storage ──

    IERC3009 public immutable usdc;
    address public immutable feeRecipient;
    uint256 public jobCount;
    mapping(uint256 => Job) internal _jobs;
    mapping(bytes32 => bool) public usedNonces;

    // ── Events ──

    event JobCreated(uint256 indexed jobId, address indexed buyer, address indexed provider, uint256 amount, bytes32 descriptionHash);
    event JobMarkedDone(uint256 indexed jobId, uint256 doneAt);
    event JobAccepted(uint256 indexed jobId);
    event JobDisputed(uint256 indexed jobId);
    event JobSettled(uint256 indexed jobId, address indexed recipient, uint256 payout, uint256 fee);
    event DisputeResolved(uint256 indexed jobId, uint256 buyerAmount, uint256 providerAmount, uint256 fee);
    event JobForceClosed(uint256 indexed jobId);

    // ── Errors ──

    error InvalidSignature();
    error NonceAlreadyUsed(bytes32 nonce);
    error JobNotFound(uint256 jobId);
    error InvalidStatus(uint256 jobId, JobStatus expected, JobStatus actual);
    error AcceptancePeriodNotExpired(uint256 jobId);
    error MaxLifetimeNotExpired(uint256 jobId);
    error InvalidSplitAmounts(uint256 total, uint256 budget);
    error ZeroAddress();
    error ZeroAmount();
    error AlreadySettled(uint256 jobId);

    // ── Constructor ──

    constructor(
        address _usdc,
        address _feeRecipient,
        address _owner
    ) EIP712("StringEscrow", "1") Ownable(_owner) {
        if (_usdc == address(0)) revert ZeroAddress();
        if (_feeRecipient == address(0)) revert ZeroAddress();
        usdc = IERC3009(_usdc);
        feeRecipient = _feeRecipient;
    }

    // ── Core Lifecycle ──

    /// @notice Create and fund a job atomically via EIP-3009
    function createAndFund(
        address buyer,
        address provider,
        uint256 amount,
        bytes32 descriptionHash,
        bytes32 nonce,
        bytes calldata buyerSig,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 paymentNonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 jobId) {
        if (buyer == address(0) || provider == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (usedNonces[nonce]) revert NonceAlreadyUsed(nonce);

        // Verify buyer's EIP-712 signature
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            CREATE_JOB_TYPEHASH, buyer, provider, amount, descriptionHash, nonce
        )));
        if (ECDSA.recover(digest, buyerSig) != buyer) revert InvalidSignature();

        usedNonces[nonce] = true;

        // Pull funds via EIP-3009
        usdc.transferWithAuthorization(buyer, address(this), amount, validAfter, validBefore, paymentNonce, v, r, s);

        // Store job
        jobId = jobCount++;
        _jobs[jobId] = Job({
            buyer: buyer,
            provider: provider,
            amount: amount,
            descriptionHash: descriptionHash,
            status: JobStatus.Funded,
            createdAt: block.timestamp,
            doneAt: 0
        });

        emit JobCreated(jobId, buyer, provider, amount, descriptionHash);
    }

    /// @notice Provider marks job as done, starts 24h acceptance timer
    function markDone(uint256 jobId, bytes calldata providerSig) external nonReentrant {
        Job storage job = _getJob(jobId);
        if (job.status != JobStatus.Funded) revert InvalidStatus(jobId, JobStatus.Funded, job.status);

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(MARK_DONE_TYPEHASH, jobId)));
        if (ECDSA.recover(digest, providerSig) != job.provider) revert InvalidSignature();

        job.status = JobStatus.Done;
        job.doneAt = block.timestamp;

        emit JobMarkedDone(jobId, block.timestamp);
    }

    /// @notice Buyer accepts result — immediate release to provider minus fee
    function acceptResult(uint256 jobId, bytes calldata buyerSig) external nonReentrant {
        Job storage job = _getJob(jobId);
        if (job.status != JobStatus.Done) revert InvalidStatus(jobId, JobStatus.Done, job.status);

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(ACCEPT_RESULT_TYPEHASH, jobId)));
        if (ECDSA.recover(digest, buyerSig) != job.buyer) revert InvalidSignature();

        emit JobAccepted(jobId);
        _settle(job, jobId, job.provider);
    }

    /// @notice Buyer disputes during Done phase
    function dispute(uint256 jobId, bytes calldata buyerSig) external nonReentrant {
        Job storage job = _getJob(jobId);
        if (job.status != JobStatus.Done) revert InvalidStatus(jobId, JobStatus.Done, job.status);

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(DISPUTE_TYPEHASH, jobId)));
        if (ECDSA.recover(digest, buyerSig) != job.buyer) revert InvalidSignature();

        job.status = JobStatus.Disputed;

        emit JobDisputed(jobId);
    }

    /// @notice Auto-release to provider after 24h acceptance period
    function claimTimeout(uint256 jobId) external nonReentrant {
        Job storage job = _getJob(jobId);
        if (job.status != JobStatus.Done) revert InvalidStatus(jobId, JobStatus.Done, job.status);
        if (block.timestamp < job.doneAt + ACCEPTANCE_PERIOD) revert AcceptancePeriodNotExpired(jobId);

        _settle(job, jobId, job.provider);
    }

    /// @notice Judge resolves dispute with split amounts
    function resolveDispute(uint256 jobId, uint256 buyerAmount, uint256 providerAmount) external onlyOwner nonReentrant {
        Job storage job = _getJob(jobId);
        if (job.status != JobStatus.Disputed) revert InvalidStatus(jobId, JobStatus.Disputed, job.status);
        uint256 amount = job.amount;
        if (buyerAmount + providerAmount != amount) revert InvalidSplitAmounts(buyerAmount + providerAmount, amount);

        job.status = JobStatus.Settled;

        uint256 fee = (amount * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 totalAfterFee = amount - fee;

        uint256 buyerPayout = 0;
        uint256 providerPayout = 0;

        if (buyerAmount > 0) {
            buyerPayout = (totalAfterFee * buyerAmount) / amount;
        }
        // Provider gets remainder (absorbs rounding dust)
        providerPayout = totalAfterFee - buyerPayout;

        if (fee > 0) {
            IERC20(address(usdc)).safeTransfer(feeRecipient, fee);
        }
        if (buyerPayout > 0) {
            IERC20(address(usdc)).safeTransfer(job.buyer, buyerPayout);
        }
        if (providerPayout > 0) {
            IERC20(address(usdc)).safeTransfer(job.provider, providerPayout);
        }

        emit DisputeResolved(jobId, buyerAmount, providerAmount, fee);
    }

    /// @notice Safety valve: force close after MAX_JOB_LIFETIME, full refund to buyer (no fee)
    function forceClose(uint256 jobId) external nonReentrant {
        Job storage job = _getJob(jobId);
        if (job.status == JobStatus.Settled) revert AlreadySettled(jobId);
        if (block.timestamp < job.createdAt + MAX_JOB_LIFETIME) revert MaxLifetimeNotExpired(jobId);

        job.status = JobStatus.Settled;
        IERC20(address(usdc)).safeTransfer(job.buyer, job.amount);

        emit JobForceClosed(jobId);
    }

    // ── View ──

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    // ── Internal ──

    function _getJob(uint256 jobId) internal view returns (Job storage) {
        if (jobId >= jobCount) revert JobNotFound(jobId);
        return _jobs[jobId];
    }

    function _settle(Job storage job, uint256 jobId, address recipient) internal {
        job.status = JobStatus.Settled;

        uint256 amount = job.amount;
        uint256 fee = (amount * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 payout = amount - fee;

        if (fee > 0) {
            IERC20(address(usdc)).safeTransfer(feeRecipient, fee);
        }
        IERC20(address(usdc)).safeTransfer(recipient, payout);

        emit JobSettled(jobId, recipient, payout, fee);
    }
}

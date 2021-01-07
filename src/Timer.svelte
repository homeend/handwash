<script>
    import ProgressBar from './ProgressBar.svelte';
</script>

<style>
    h2 {
        margin: 0;
    }
    .start {
        background-color: rgb(153, 72, 72);
        width: 100%;
        margin: 10px 0;
    }
</style>

<div bp="grid">
    <h2 bp="offset-5@md 4@md 12@sm">
        Seconds Left: 
    </h2>
</div>

<ProgressBar />

<div bp="grid">
    <button bp="offset-5@md 4@md 12@sm" class="start">Start</button>
</div>